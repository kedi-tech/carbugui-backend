const crypto = require('crypto');
const prisma = require('./prisma');
const djomy = require('./djomy');
const { sendSubscriptionConfirmation } = require('./sms');

/**
 * Abonnements chauffeurs payés via un lien de paiement Djomy.
 *
 * Flux :
 *   1. startCheckout() crée un Payment PENDING puis le lien Djomy (15 min).
 *   2. Le chauffeur paie sur la page Djomy.
 *   3. Djomy appelle le webhook (controllers/webhooks/djomyController.js).
 *      Son contenu n'est JAMAIS cru tel quel : on relit le statut via
 *      GET /v1/payments/{transactionId}/status avant d'accorder l'accès.
 *   4. Filet de sécurité : reconcilePendingPayments() (toutes les minutes,
 *      server.js) interroge Djomy pour les paiements restés PENDING — un
 *      webhook perdu ne bloque donc jamais un chauffeur qui a payé.
 *
 * Accorder l'accès est idempotent : la bascule PENDING → SUCCEEDED est un
 * updateMany conditionnel (une seule requête concurrente peut gagner) et
 * Subscription.paymentId est unique.
 */

const LINK_TTL_MINUTES = Number(process.env.DJOMY_LINK_TTL_MINUTES) || 15;
// Laisse le temps à un paiement soumis juste avant l'expiration du lien
// d'aboutir avant de déclarer le Payment EXPIRED.
const EXPIRY_GRACE_MINUTES = 10;
const RECONCILE_MAX_AGE_HOURS = 48;

const SUCCESS_STATUSES = ['SUCCESS', 'CAPTURED'];
const FAILED_STATUSES = ['FAILED'];
const CANCELED_STATUSES = ['CANCELLED', 'CANCELED'];

// Activé par défaut : SUBSCRIPTION_REQUIRED=false rouvre la recherche de
// stations à tous (utile pendant la migration du frontend).
const isSubscriptionRequired = () => process.env.SUBSCRIPTION_REQUIRED !== 'false';

const toInt = (value) => (value === undefined || value === null || value === '' ? null : Math.round(Number(value)));

// Ex. "SUB-M2X7K9QF-3A1C" : unique, lisible au support, accepté par Djomy.
const generateMerchantReference = () =>
  `SUB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

/**
 * État d'abonnement d'un compte. `accessUntil` tient compte des périodes
 * achetées d'avance (elles s'enchaînent), `current` est la période en cours.
 */
const getSubscriptionStatus = async (accountId) => {
  const now = new Date();

  const upcoming = await prisma.subscription.findMany({
    where: { accountId, endsAt: { gt: now } },
    include: { plan: true },
    orderBy: { startsAt: 'asc' },
  });

  const current = upcoming.find((s) => s.startsAt <= now) || null;

  return {
    active: Boolean(current),
    current,
    accessUntil: current ? upcoming[upcoming.length - 1].endsAt : null,
    upcoming: upcoming.filter((s) => s !== current),
  };
};

/**
 * Crée le Payment PENDING et le lien Djomy correspondant. Si Djomy refuse,
 * le Payment passe FAILED (avec la raison) pour garder une trace.
 */
const startCheckout = async ({ account, plan }) => {
  const merchantReference = generateMerchantReference();
  const linkExpiresAt = new Date(Date.now() + LINK_TTL_MINUTES * 60 * 1000);

  const payment = await prisma.payment.create({
    data: {
      accountId: account.id,
      planId: plan.id,
      amountGnf: plan.priceGnf,
      merchantReference,
      linkExpiresAt,
    },
  });

  try {
    const link = await djomy.createPaymentLink({
      amount: plan.priceGnf,
      merchantReference,
      description: `Abonnement Carbugui ${plan.label}`,
      // Djomy attend le format international sans "+" (ex. 00224621999616).
      phoneNumber: account.phoneNumber ? account.phoneNumber.replace(/^\+/, '00') : undefined,
      expiresAt: linkExpiresAt,
      metadata: {
        type: 'subscription',
        paymentId: payment.id,
        accountId: account.id,
        planCode: plan.code,
      },
    });

    return prisma.payment.update({
      where: { id: payment.id },
      data: {
        paymentLinkReference: link?.paymentLinkReference || link?.reference || null,
        paymentUrl: link?.paymentPageUrl || null,
      },
      include: { plan: true },
    });
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureReason: String(error.message).slice(0, 190) },
    });
    throw error;
  }
};

// Copie les montants / références renvoyés par Djomy sur le Payment.
const paymentFieldsFromDjomy = (djomyPayment) => ({
  ...(djomyPayment.transactionId && { transactionId: djomyPayment.transactionId }),
  ...(djomyPayment.paymentMethod && { paymentMethod: djomyPayment.paymentMethod }),
  ...(djomyPayment.payerIdentifier && { payerIdentifier: String(djomyPayment.payerIdentifier) }),
  ...(djomyPayment.providerReference && { providerReference: djomyPayment.providerReference }),
  ...(toInt(djomyPayment.paidAmount) !== null && { paidAmount: toInt(djomyPayment.paidAmount) }),
  ...(toInt(djomyPayment.receivedAmount) !== null && { receivedAmount: toInt(djomyPayment.receivedAmount) }),
  ...(toInt(djomyPayment.fees) !== null && { fees: toInt(djomyPayment.fees) }),
});

/**
 * Bascule le Payment en SUCCEEDED et crée la période d'abonnement. Retourne
 * la Subscription créée, ou null si le paiement était déjà traité.
 */
const grantSubscription = async (paymentId, djomyPayment) =>
  prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: paymentId, status: { not: 'SUCCEEDED' } },
      data: { ...paymentFieldsFromDjomy(djomyPayment), status: 'SUCCEEDED', failureReason: null, paidAt: new Date() },
    });

    if (claimed.count === 0) return null;

    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { plan: true } });
    const now = new Date();

    // Une période achetée avant la fin de la précédente démarre à sa suite.
    const latest = await tx.subscription.findFirst({
      where: { accountId: payment.accountId, endsAt: { gt: now } },
      orderBy: { endsAt: 'desc' },
    });

    const startsAt = latest ? latest.endsAt : now;
    const endsAt = new Date(startsAt.getTime() + payment.plan.durationHours * 60 * 60 * 1000);

    return tx.subscription.create({
      data: { accountId: payment.accountId, planId: payment.planId, paymentId: payment.id, startsAt, endsAt },
    });
  });

/**
 * SMS de confirmation au chauffeur. Un échec d'envoi est seulement journalisé :
 * l'abonnement est déjà accordé et ne doit pas être remis en cause.
 */
const notifySubscriptionGranted = async (payment, subscription) => {
  try {
    const [account, plan] = await Promise.all([
      prisma.account.findUnique({ where: { id: payment.accountId }, select: { phoneNumber: true } }),
      prisma.plan.findUnique({ where: { id: payment.planId }, select: { label: true } }),
    ]);

    if (!account?.phoneNumber) return;

    await sendSubscriptionConfirmation(account.phoneNumber, {
      planLabel: plan?.label || '',
      amountGnf: payment.amountGnf,
      startsAt: subscription.startsAt,
      endsAt: subscription.endsAt,
      merchantReference: payment.merchantReference,
    });
  } catch (error) {
    console.error(`SMS confirmation abonnement ${payment.merchantReference} non envoyé:`, error.message);
  }
};

/**
 * Applique un statut de paiement Djomy VÉRIFIÉ (lu via l'API, jamais
 * directement depuis le webhook) au Payment local.
 */
const applyVerifiedDjomyPayment = async (payment, djomyPayment) => {
  const status = String(djomyPayment.status || '').toUpperCase();

  if (SUCCESS_STATUSES.includes(status)) {
    const paid = toInt(djomyPayment.paidAmount);
    const currency = djomyPayment.currency || 'GNF';

    // Garde-fou : jamais d'accès pour un montant inférieur au prix du forfait
    // au moment de l'achat, ou dans une autre devise.
    if (currency !== 'GNF' || paid === null || paid < payment.amountGnf) {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: {
          ...paymentFieldsFromDjomy(djomyPayment),
          status: 'FAILED',
          failureReason: `Montant reçu invalide (${paid} ${currency}, attendu ${payment.amountGnf} GNF).`,
        },
      });
      return { outcome: 'amount_mismatch' };
    }

    const subscription = await grantSubscription(payment.id, djomyPayment);

    // Seul l'appel qui a réellement accordé la période envoie le SMS : un
    // webhook rejoué ou une revérification n'en renvoie jamais un second.
    if (subscription) {
      await notifySubscriptionGranted(payment, subscription);
    }

    return { outcome: subscription ? 'granted' : 'already_processed', subscription };
  }

  if (FAILED_STATUSES.includes(status) || CANCELED_STATUSES.includes(status)) {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: {
        ...paymentFieldsFromDjomy(djomyPayment),
        status: FAILED_STATUSES.includes(status) ? 'FAILED' : 'CANCELED',
        failureReason: `Statut Djomy : ${status}`,
      },
    });
    return { outcome: status.toLowerCase() };
  }

  // CREATED / PENDING / REDIRECTED / AUTHORIZED : toujours en cours.
  if (djomyPayment.transactionId && !payment.transactionId) {
    await prisma.payment.updateMany({
      where: { id: payment.id, transactionId: null },
      data: { transactionId: djomyPayment.transactionId },
    });
  }
  return { outcome: 'pending' };
};

/** Relit le paiement chez Djomy (source de vérité) puis l'applique. */
const settleByTransactionId = async (payment, transactionId) => {
  const djomyPayment = await djomy.getPaymentStatus(transactionId);
  if (!djomyPayment) return { outcome: 'not_found' };

  // Le transactionId doit bien concerner CE paiement : empêche un webhook
  // forgé de valider un Payment avec la transaction réussie d'un autre.
  if (djomyPayment.merchantPaymentReference && djomyPayment.merchantPaymentReference !== payment.merchantReference) {
    return { outcome: 'reference_mismatch' };
  }
  if (!djomyPayment.merchantPaymentReference && djomyPayment.paymentLinkReference
    && djomyPayment.paymentLinkReference !== payment.paymentLinkReference) {
    return { outcome: 'reference_mismatch' };
  }

  return applyVerifiedDjomyPayment(payment, djomyPayment);
};

/**
 * Met à jour un Payment PENDING depuis Djomy sans attendre de webhook :
 * via sa transaction si on la connaît, sinon via son lien de paiement.
 */
const reconcilePayment = async (payment) => {
  if (payment.status !== 'PENDING') return { outcome: 'not_pending' };

  if (payment.transactionId) {
    return settleByTransactionId(payment, payment.transactionId);
  }

  if (payment.paymentLinkReference) {
    const link = await djomy.getPaymentLink(payment.paymentLinkReference);
    const linkPayments = Array.isArray(link?.payments) ? link.payments : [];
    const candidate = linkPayments.find((p) => SUCCESS_STATUSES.includes(String(p.status).toUpperCase()))
      || linkPayments[0];

    if (candidate?.transactionId) {
      return settleByTransactionId(payment, candidate.transactionId);
    }
  }

  const expiredBefore = new Date(Date.now() - EXPIRY_GRACE_MINUTES * 60 * 1000);
  if (payment.linkExpiresAt && payment.linkExpiresAt < expiredBefore) {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'EXPIRED', failureReason: 'Lien de paiement expiré sans paiement.' },
    });
    return { outcome: 'expired' };
  }

  return { outcome: 'pending' };
};

/** Tâche périodique (server.js) : rattrape les webhooks perdus. */
const reconcilePendingPayments = async () => {
  if (!process.env.DJOMY_CLIENT_ID || !process.env.DJOMY_CLIENT_SECRET) return;

  const now = Date.now();
  const pending = await prisma.payment.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: new Date(now - 60 * 1000), gt: new Date(now - RECONCILE_MAX_AGE_HOURS * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  for (const payment of pending) {
    try {
      await reconcilePayment(payment);
    } catch (error) {
      console.error(`reconcilePayment ${payment.merchantReference} error:`, error.message);
    }
  }

  // Au-delà de la fenêtre de rattrapage, un PENDING ne bougera plus.
  await prisma.payment.updateMany({
    where: { status: 'PENDING', createdAt: { lte: new Date(now - RECONCILE_MAX_AGE_HOURS * 60 * 60 * 1000) } },
    data: { status: 'EXPIRED', failureReason: 'Aucune confirmation Djomy reçue.' },
  });
};

module.exports = {
  isSubscriptionRequired,
  getSubscriptionStatus,
  startCheckout,
  settleByTransactionId,
  reconcilePayment,
  reconcilePendingPayments,
};
