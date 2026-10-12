const prisma = require('../../../utils/prisma');
const { reconcilePayment, settleByTransactionId } = require('../../../utils/subscriptions');

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
