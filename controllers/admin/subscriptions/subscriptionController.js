const prisma = require('../../../utils/prisma');
const { grantFreePass, reconcilePayment, settleByTransactionId } = require('../../../utils/subscriptions');
const { normalizeGuineaPhone } = require('../../../utils/functions');

const PAYMENT_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED'];
const accountSelect = { select: { id: true, fullName: true, phoneNumber: true } };

// GET /admin/subscriptions/plans
exports.getPlans = async (req, res) => {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });

  return res.status(200).json({ success: true, count: plans.length, data: plans });
};

// PUT /admin/subscriptions/plans/:code — n'affecte que les futurs achats.
exports.updatePlan = async (req, res) => {
  const { label, priceGnf, isActive } = req.body;

  if (priceGnf !== undefined && (!Number.isInteger(priceGnf) || priceGnf <= 0)) {
    return res.status(400).json({ success: false, message: 'priceGnf doit être un entier positif.' });
  }

  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return res.status(400).json({ success: false, message: 'isActive doit être un booléen.' });
  }

  const plan = await prisma.plan.update({
    where: { code: String(req.params.code).toUpperCase() },
    data: {
      ...(label !== undefined && { label }),
      ...(priceGnf !== undefined && { priceGnf }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return res.status(200).json({ success: true, data: plan });
};

// GET /admin/subscriptions?accountId&active=true
exports.getSubscriptions = async (req, res) => {
  const { accountId, active } = req.query;
  const now = new Date();

  const subscriptions = await prisma.subscription.findMany({
    where: {
      ...(accountId && { accountId }),
      ...(active === 'true' && { startsAt: { lte: now }, endsAt: { gt: now } }),
    },
    include: { plan: true, account: accountSelect },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return res.status(200).json({ success: true, count: subscriptions.length, data: subscriptions });
};

// GET /admin/subscriptions/payments?status&accountId
exports.getPayments = async (req, res) => {
  const { status, accountId } = req.query;

  if (status && !PAYMENT_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status invalide. Valeurs : ${PAYMENT_STATUSES.join(', ')}.` });
  }

  const payments = await prisma.payment.findMany({
    where: { ...(status && { status }), ...(accountId && { accountId }) },
    include: { plan: true, subscription: true, account: accountSelect },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return res.status(200).json({ success: true, count: payments.length, data: payments });
};

// POST /admin/subscriptions/grant — pass offert, sans paiement. Sert surtout
// au compte de test App Review ; avec un phoneNumber inconnu, le compte
// DRIVER est créé (le testeur se connectera ensuite avec ce numéro).
exports.grantPass = async (req, res) => {
  const { accountId, phoneNumber, planCode = 'MONTH', durationDays, note } = req.body;

  if (!accountId && !phoneNumber) {
    return res.status(400).json({ success: false, message: 'accountId ou phoneNumber est requis.' });
  }

  if (durationDays !== undefined && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 366)) {
    return res.status(400).json({ success: false, message: 'durationDays doit être un entier entre 1 et 366.' });
  }

  const plan = await prisma.plan.findUnique({ where: { code: String(planCode).toUpperCase() } });
  if (!plan) {
    return res.status(404).json({ success: false, message: 'Formule introuvable.' });
  }

  let account;
  if (accountId) {
    account = await prisma.account.findUnique({ where: { id: accountId } });
  } else {
    const normalized = normalizeGuineaPhone(phoneNumber);
    if (!normalized) {
      return res.status(400).json({ success: false, message: 'Numéro invalide. Format attendu : +224XXXXXXXXX.' });
    }
    account = await prisma.account.findUnique({ where: { phoneNumber: normalized } })
      || await prisma.account.create({ data: { phoneNumber: normalized, role: 'DRIVER' } });
  }

  if (!account) {
    return res.status(404).json({ success: false, message: 'Compte introuvable.' });
  }

  if (account.role !== 'DRIVER') {
    return res.status(400).json({ success: false, message: 'Seul un compte chauffeur (DRIVER) peut recevoir un pass.' });
  }

  const subscription = await grantFreePass({
    accountId: account.id,
    plan,
    durationHours: durationDays ? durationDays * 24 : undefined,
    grantedById: req.auth.accountId,
    note: note ? String(note).slice(0, 190) : null,
  });

  return res.status(201).json({
    success: true,
    data: { ...subscription, account: { id: account.id, fullName: account.fullName, phoneNumber: account.phoneNumber } },
  });
};

// POST /admin/subscriptions/payments/:id/reconcile — revérifie chez Djomy
// (ex. client qui affirme avoir payé alors que le paiement est EXPIRED).
exports.reconcilePayment = async (req, res) => {
  const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });

  if (!payment) {
    return res.status(404).json({ success: false, message: 'Paiement introuvable.' });
  }

  let result = { outcome: 'nothing_to_check' };

  if (payment.status === 'PENDING') {
    result = await reconcilePayment(payment);
  } else if (payment.transactionId) {
    result = await settleByTransactionId(payment, payment.transactionId);
  }

  const updated = await prisma.payment.findUnique({
    where: { id: payment.id },
    include: { plan: true, subscription: true, account: accountSelect },
  });

  return res.status(200).json({ success: true, outcome: result.outcome, data: updated });
};
