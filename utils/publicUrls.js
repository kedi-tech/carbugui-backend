/**
 * URLs publiques du site, construites depuis PUBLIC_BASE_URL (ex.
 * https://api.carbugui.com). Toutes renvoient null tant que la variable
 * n'est pas configurée : les appelants sautent alors le lien plutôt que
 * d'envoyer une adresse fausse.
 */
const getPublicBaseUrl = () => {
  const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  return base || null;
};

// Page web d'achat du pass (utilisée par les chauffeurs iPhone, cf. public/pass).
const getPassPageUrl = () => {
  const base = getPublicBaseUrl();
  return base ? `${base}/pass` : null;
};

// Retour après la page Djomy. Djomy exige du https et ajoute lui-même
// ?transactionId=…&status=… à l'URL.
const getPassReturnUrl = () => {
  const base = getPublicBaseUrl();
  return base && base.startsWith('https://') ? `${base}/pass/merci` : null;
};

module.exports = { getPublicBaseUrl, getPassPageUrl, getPassReturnUrl };
