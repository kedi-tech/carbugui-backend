const crypto = require('crypto');
const axios = require('axios');

/**
 * Client de l'API partenaire Djomy (https://developers.djomy.africa).
 *
 * Authentification : chaque requête porte l'en-tête
 *   X-API-KEY: <clientId>:<HMAC_SHA256(clientId, clientSecret) en hex>
 * et, sauf /v1/auth, un Bearer obtenu via POST /v1/auth (valide 1 h, mis en
 * cache ici jusqu'à 1 min avant son expiration).
 *
 * Les identifiants viennent exclusivement des variables d'environnement
 * (DJOMY_CLIENT_ID / DJOMY_CLIENT_SECRET) — jamais en dur dans le code.
 */

const DEFAULT_BASE_URL = 'https://sandbox-api.djomy.africa';
const TOKEN_SAFETY_MARGIN_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 20 * 1000;

const getConfig = () => {
  const clientId = process.env.DJOMY_CLIENT_ID;
  const clientSecret = process.env.DJOMY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    const error = new Error('Paiement indisponible : DJOMY_CLIENT_ID / DJOMY_CLIENT_SECRET non configurés.');
    error.statusCode = 503;
    throw error;
  }

  return {
    clientId,
    clientSecret,
    baseUrl: (process.env.DJOMY_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
  };
};

const hmacHex = (message, secret) => crypto.createHmac('sha256', secret).update(message).digest('hex');

const apiKeyHeader = ({ clientId, clientSecret }) => `${clientId}:${hmacHex(clientId, clientSecret)}`;

// Shapes an axios failure into an Error carrying Djomy's own message, so it
// surfaces in logs/responses instead of a bare "Request failed with 400".
const toDjomyError = (error, action) => {
  const body = error.response?.data;
  const detail = body?.message || body?.error?.message || error.message;
  const wrapped = new Error(`Djomy ${action} : ${detail}`);
  wrapped.statusCode = 502;
  wrapped.djomyStatus = error.response?.status;
  wrapped.djomyBody = body;
  return wrapped;
};

let cachedToken = null; // { accessToken, expiresAt }

const fetchAccessToken = async (config) => {
  try {
    const { data } = await axios.post(`${config.baseUrl}/v1/auth`, {}, {
      headers: { 'X-API-KEY': apiKeyHeader(config), 'Content-Type': 'application/json' },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const token = data?.data?.accessToken;
    if (!token) {
      throw new Error('accessToken absent de la réponse');
    }

    const expiresInMs = (Number(data.data.expiresIn) || 3600) * 1000;
    cachedToken = { accessToken: token, expiresAt: Date.now() + expiresInMs - TOKEN_SAFETY_MARGIN_MS };

    return token;
  } catch (error) {
    throw toDjomyError(error, 'authentification');
  }
};

const getAccessToken = async (config, { forceRefresh = false } = {}) => {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  return fetchAccessToken(config);
};

// Authenticated request with one transparent retry on 401 (token revoked or
// expired earlier than announced).
const request = async (method, path, { data, action } = {}) => {
  const config = getConfig();

  const send = async (forceRefresh) => {
    const token = await getAccessToken(config, { forceRefresh });

    return axios({
      method,
      url: `${config.baseUrl}${path}`,
      data,
      headers: {
        'X-API-KEY': apiKeyHeader(config),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    });
  };

  try {
    const response = await send(false);
    return response.data?.data;
  } catch (error) {
    if (error.response?.status === 401) {
      try {
        const response = await send(true);
        return response.data?.data;
      } catch (retryError) {
        throw toDjomyError(retryError, action);
      }
    }

    throw toDjomyError(error, action);
  }
};

/**
 * POST /v1/links — génère un lien de paiement à usage unique.
 * `metadata` doit être un objet plat (pas de liste ni d'objet imbriqué).
 * Retourne le PartnerPaymentLinkDto (paymentLinkReference, paymentPageUrl…).
 */
const createPaymentLink = ({ amount, merchantReference, description, phoneNumber, expiresAt, metadata }) => {
  const body = {
    amountToPay: amount,
    linkName: merchantReference,
    description,
    countryCode: 'GN',
    usageType: 'UNIQUE',
    usageLimit: 1,
    merchantReference,
    expiresAt: expiresAt.toISOString(),
    metadata,
    ...(phoneNumber && { phoneNumber }),
    ...(process.env.DJOMY_SEND_SMS === 'true' && phoneNumber && { sendSms: true }),
    // Djomy refuse (400) une URL de retour qui n'est pas en https.
    ...(process.env.DJOMY_RETURN_URL && { returnUrl: process.env.DJOMY_RETURN_URL }),
    ...(process.env.DJOMY_CANCEL_URL && { cancelUrl: process.env.DJOMY_CANCEL_URL }),
  };

  return request('post', '/v1/links', { data: body, action: 'création du lien de paiement' });
};

/** GET /v1/links/{reference} — détail d'un lien, avec ses paiements réussis. */
const getPaymentLink = (reference) =>
  request('get', `/v1/links/${encodeURIComponent(reference)}`, { action: 'lecture du lien de paiement' });

/** GET /v1/payments/{transactionId}/status — source de vérité d'un paiement. */
const getPaymentStatus = (transactionId) =>
  request('get', `/v1/payments/${encodeURIComponent(transactionId)}/status`, { action: 'lecture du statut de paiement' });

/**
 * Vérifie l'en-tête `X-Webhook-Signature: v1:<signature>` : HMAC-SHA256 du
 * corps brut de la requête, signé avec le clientSecret. Comparaison à temps
 * constant. Retourne false (sans lever) si l'en-tête ou le corps manque.
 */
const verifyWebhookSignature = (rawBody, signatureHeader) => {
  const secret = process.env.DJOMY_CLIENT_SECRET;
  if (!secret || !rawBody || !signatureHeader) return false;

  const provided = String(signatureHeader).trim().replace(/^v1:/i, '');
  const expected = hmacHex(rawBody, secret);

  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = {
  createPaymentLink,
  getPaymentLink,
  getPaymentStatus,
  verifyWebhookSignature,
};
