const { getSubscriptionStatus } = require('../utils/subscriptions');

/**
 * À utiliser après `auth`. Un chauffeur (DRIVER) doit avoir une période
 * d'abonnement en cours ; les comptes STATION / ADMIN passent toujours.
 * Répond 402 avec `code: 'SUBSCRIPTION_REQUIRED'` pour que l'app puisse
 * ouvrir directement l'écran d'abonnement.
 */
const requireActiveSubscription = async (req, res, next) => {
  if (req.auth.role !== 'DRIVER') {
    return next();
  }

  const status = await getSubscriptionStatus(req.auth.accountId);

  if (!status.active) {
    return res.status(402).json({
      success: false,
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Abonnement requis. Choisissez une formule 24 heures ou 1 mois pour accéder aux stations.',
    });
  }

  req.subscription = status;
  next();
};

module.exports = { requireActiveSubscription };
