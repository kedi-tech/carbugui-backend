const prisma = require('../../utils/prisma');
const { verifyWebhookSignature } = require('../../utils/djomy');
const { settleByTransactionId, reconcilePayment } = require('../../utils/subscriptions');

// Accepte les deux formats de webhook Djomy : V1 (paiement directement dans
// `data`) et V2 (`data.payment`). Par prudence, accepte aussi les champs du
// paiement à la racine du corps.
const extractPaymentData = (body) => {
  if (body?.data?.payment) return body.data.payment;
  if (body?.data?.transactionId || body?.data?.merchantPaymentReference) return body.data;
  if (body?.transactionId || body?.merchantPaymentReference) return body;
  return null;
};

const findPayment = async (paymentData, body) => {
  const metadata = body.metadata || {};

  if (paymentData?.merchantPaymentReference) {
    const payment = await prisma.payment.findUnique({ where: { merchantReference: String(paymentData.merchantPaymentReference) } });
    if (payment) return payment;
  }

  if (metadata.paymentId) {
    const payment = await prisma.payment.findUnique({ where: { id: String(metadata.paymentId) } });
    if (payment) return payment;
  }

  if (body.paymentLinkReference) {
    return prisma.payment.findUnique({ where: { paymentLinkReference: String(body.paymentLinkReference) } });
  }

  return null;
};

// POST /webhooks/djomy — appelé par Djomy à chaque changement de statut.
// Le contenu sert uniquement à retrouver le Payment : le statut réel est
// toujours relu via l'API Djomy avant d'accorder un abonnement.
exports.handleDjomyWebhook = async (req, res) => {
  const body = req.body || {};
  const signatureValid = verifyWebhookSignature(req.rawBody, req.header('X-Webhook-Signature'));

  const event = await prisma.webhookEvent.create({
    data: {
      provider: 'djomy',
      eventId: body.eventId ? String(body.eventId) : null,
      eventType: body.eventType ? String(body.eventType) : null,
      signatureValid,
      payload: body,
    },
  });

  const finish = async (status, payload, error = null) => {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), error },
    });
    return res.status(status).json(payload);
  };

  if (!signatureValid && process.env.DJOMY_WEBHOOK_REQUIRE_SIGNATURE === 'true') {
    return finish(401, { success: false, message: 'Signature invalide.' }, 'Signature X-Webhook-Signature invalide ou absente.');
  }

  if (String(body.eventType || '').startsWith('payout.')) {
    return finish(200, { success: true, message: 'Événement ignoré.' });
  }

  const paymentData = extractPaymentData(body);
  const payment = await findPayment(paymentData, body);

  if (!payment) {
    // 200 quand même : Djomy n'a pas à rejouer un événement qui ne nous
    // concerne pas (ex. lien créé depuis un autre système du marchand).
    return finish(200, { success: true, message: 'Paiement inconnu, ignoré.' }, 'Aucun Payment correspondant.');
  }

  try {
    const result = paymentData?.transactionId
      ? await settleByTransactionId(payment, String(paymentData.transactionId))
      : await reconcilePayment(payment);

    return finish(200, { success: true, outcome: result.outcome });
  } catch (error) {
    // 500 → Djomy rejouera ; le poller de rattrapage repassera aussi.
    console.error('Djomy webhook processing error:', error.message);
    return finish(500, { success: false, message: 'Traitement momentanément impossible.' }, String(error.message));
  }
};
