const createAsyncRouter = require('../../../utils/asyncRouter');
const subscriptionController = require('../../../controllers/app/subscriptions/subscriptionController');
const { auth, requireRole } = require('../../../middleware/auth');

const router = createAsyncRouter();

router.get('/plans', subscriptionController.getPlans);

router.get('/me', auth, requireRole('DRIVER'), subscriptionController.getMySubscription);
router.post('/checkout', auth, requireRole('DRIVER'), subscriptionController.checkout);
router.get('/payments', auth, requireRole('DRIVER'), subscriptionController.getMyPayments);
router.get('/payments/:id', auth, requireRole('DRIVER'), subscriptionController.getMyPayment);

module.exports = router;
