const createAsyncRouter = require('../../../utils/asyncRouter');
const accountController = require('../../../controllers/admin/accounts/accountController');
const { auth, requireRole } = require('../../../middleware/auth');

const router = createAsyncRouter();

router.use(auth, requireRole('ADMIN'));

router.get('/', accountController.getAccounts);
router.post('/admins', accountController.createAdmin);
router.get('/:id', accountController.getAccountById);
router.put('/:id/status', accountController.updateAccountStatus);
router.post('/:id/password', accountController.resetStationPassword);
router.delete('/:id', accountController.deleteAccount);

module.exports = router;
