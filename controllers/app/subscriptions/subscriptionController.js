const prisma = require('../../../utils/prisma');
const {
  getSubscriptionStatus,
  isSubscriptionRequired,
  reconcilePayment,
  startCheckout,
} = require('../../../utils/subscriptions');
const { getPassPageUrl } = require('../../../utils/publicUrls');
const { sendPassActivationLink } = require('../../../utils/sms');

// Un lien encore valide au moins 2 min est réutilisé au lieu d'en générer un
// nouveau à chaque tap sur "Payer".
const LINK_REUSE_MIN_REMAINING_MS = 2 * 60 * 1000;

const publicPayment = (payment) => ({
  id: payment.id,
  status: payment.status,
  amountGnf: payment.amountGnf,
  merchantReference: payment.merchantReference,
  paymentUrl: payment.paymentUrl,
  linkExpiresAt: payment.linkExpiresAt,
  paymentMethod: payment.paymentMethod,
  paidAt: payment.paidAt,
  failureReason: payment.failureReason,
  createdAt: payment.createdAt,
  plan: payment.plan ? { code: payment.plan.code, label: payment.plan.label } : null,
  subscription: payment.subscription
    ? { startsAt: payment.subscription.startsAt, endsAt: payment.subscription.endsAt }
    : null,
});

const formatStatus = (status) => ({
  required: isSubscriptionRequired(),
  active: status.active,
  accessUntil: status.accessUntil,
  current: status.current
    ? {
        id: status.current.id,
        planCode: status.current.plan.code,
        planLabel: status.current.plan.label,
        startsAt: status.current.startsAt,
        endsAt: status.current.endsAt,
      }
    : null,
  upcomingCount: status.upcoming.length,
});

exports.formatStatus = formatStatus;

// GET /app/subscriptions/plans
exports.getPlans = async (req, res) => {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { code: true, label: true, priceGnf: true, durationHours: true },
  });

  return res.status(200).json({ success: true, count: plans.length, data: plans });
};

// GET /app/subscriptions/me
exports.getMySubscription = async (req, res) => {
  const status = await getSubscriptionStatus(req.auth.accountId);

  return res.status(200).json({ success: true, data: formatStatus(status) });
};

// POST /app/subscriptions/checkout { planCode }
exports.checkout = async (req, res) => {
  const { planCode } = req.body;

  if (!planCode) {
    return res.status(400).json({ success: false, message: 'planCode est requis (DAY ou MONTH).' });
  }

  const plan = await prisma.plan.findUnique({ where: { code: String(planCode).toUpperCase() } });

  if (!plan || !plan.isActive) {
    return res.status(404).json({ success: false, message: 'Formule introuvable ou indisponible.' });
  }

  const reusable = await prisma.payment.findFirst({
    where: {
      accountId: req.auth.accountId,
      planId: plan.id,
      status: 'PENDING',
      paymentUrl: { not: null },
      amountGnf: plan.priceGnf,
      linkExpiresAt: { gt: new Date(Date.now() + LINK_REUSE_MIN_REMAINING_MS) },
    },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });

  if (reusable) {
    return res.status(200).json({ success: true, reused: true, data: publicPayment(reusable) });
  }

  const payment = await startCheckout({ account: req.account, plan });

  return res.status(201).json({ success: true, reused: false, data: publicPayment(payment) });
};

const PASS_LINK_MIN_INTERVAL_MS = 2 * 60 * 1000;
const PASS_LINK_DAILY_MAX = 5;

// POST /app/subscriptions/pass-link — bouton « Recevoir mes informations par
// SMS » de l'app iPhone : envoie le lien de la page /pass au numéro du compte
// connecté (jamais à un numéro choisi par l'app). Limité à 1 SMS toutes les
// 2 minutes et 5 sur 24 h glissantes par compte.
exports.sendPassLink = async (req, res) => {
  const passUrl = getPassPageUrl();
  if (!passUrl) {
    return res.status(503).json({ success: false, message: 'Service momentanément indisponible. Réessayez plus tard.' });
  }

  const { phoneNumber } = req.account;
  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: 'Aucun numéro de téléphone sur ce compte.' });
  }

  // Le créneau est réservé AVANT l'envoi puis compté : deux appels
  // simultanés ne peuvent pas passer tous les deux entre les gouttes.
  const now = Date.now();
  const slot = await prisma.passLinkSms.create({ data: { accountId: req.auth.accountId } });

  const [recent, today] = await Promise.all([
    prisma.passLinkSms.count({ where: { accountId: req.auth.accountId, createdAt: { gt: new Date(now - PASS_LINK_MIN_INTERVAL_MS) } } }),
    prisma.passLinkSms.count({ where: { accountId: req.auth.accountId, createdAt: { gt: new Date(now - 24 * 60 * 60 * 1000) } } }),
  ]);

  if (recent > 1 || today > PASS_LINK_DAILY_MAX) {
    await prisma.passLinkSms.delete({ where: { id: slot.id } });
    return res.status(429).json({
      success: false,
      message: recent > 1
        ? 'Un SMS vient d\'être envoyé. Réessayez dans quelques minutes.'
        : 'Vous avez atteint la limite de SMS pour aujourd\'hui. Réessayez demain.',
    });
  }

  try {
    await sendPassActivationLink(phoneNumber, passUrl);
  } catch (error) {
    // Pas de SMS parti : le créneau est rendu pour que le chauffeur puisse réessayer.
    await prisma.passLinkSms.delete({ where: { id: slot.id } });
    console.error('SMS lien pass (pass-link) non envoyé:', error.message);
    return res.status(503).json({ success: false, message: 'L\'envoi du SMS a échoué. Réessayez dans quelques minutes.' });
  }

  return res.status(200).json({ success: true });
};

// GET /app/subscriptions/payments
exports.getMyPayments = async (req, res) => {
  const payments = await prisma.payment.findMany({
    where: { accountId: req.auth.accountId },
    include: { plan: true, subscription: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return res.status(200).json({ success: true, count: payments.length, data: payments.map(publicPayment) });
};

// GET /app/subscriptions/payments/:id — à interroger au retour de la page
// Djomy : un paiement encore PENDING est revérifié en direct chez Djomy.
exports.getMyPayment = async (req, res) => {
  const payment = await prisma.payment.findFirst({
    where: { id: req.params.id, accountId: req.auth.accountId },
  });

  if (!payment) {
    return res.status(404).json({ success: false, message: 'Paiement introuvable.' });
  }

  if (payment.status === 'PENDING') {
    try {
      await reconcilePayment(payment);
    } catch (error) {
      console.error(`reconcilePayment ${payment.merchantReference} error:`, error.message);
    }
  }

  const fresh = await prisma.payment.findUnique({
    where: { id: payment.id },
    include: { plan: true, subscription: true },
  });

  return res.status(200).json({ success: true, data: publicPayment(fresh) });
};
