const createAsyncRouter = require('../../../utils/asyncRouter');
const subscriptionController = require('../../../controllers/admin/subscriptions/subscriptionController');
const { auth, requireRole } = require('../../../middleware/auth');

const router = createAsyncRouter();

router.use(auth, requireRole('ADMIN'));

router.get('/', subscriptionController.getSubscriptions);
router.get('/plans', subscriptionController.getPlans);
router.put('/plans/:code', subscriptionController.updatePlan);
router.get('/payments', subscriptionController.getPayments);
router.post('/payments/:id/reconcile', subscriptionController.reconcilePayment);

module.exports = router;
