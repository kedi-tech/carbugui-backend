const createAsyncRouter = require('../../../utils/asyncRouter');
const stationController = require('../../../controllers/app/stations/stationController');
const { auth, optionalAuth } = require('../../../middleware/auth');
const { requireActiveSubscription } = require('../../../middleware/requireSubscription');
const { isSubscriptionRequired } = require('../../../utils/subscriptions');

const router = createAsyncRouter();

// Consulter les stations est réservé aux abonnés (24 h / 1 mois). Avec
// SUBSCRIPTION_REQUIRED=false, ces routes redeviennent publiques comme avant.
const subscriberOnly = isSubscriptionRequired() ? [auth, requireActiveSubscription] : [];
const subscriberOrOptional = isSubscriptionRequired() ? [auth, requireActiveSubscription] : [optionalAuth];

router.get('/', ...subscriberOnly, stationController.getStations);
router.get('/nearby', ...subscriberOrOptional, stationController.getNearbyStations);
router.get('/:id', ...subscriberOnly, stationController.getStationById);
router.post('/:id/reports', auth, stationController.createReport);

module.exports = router;
