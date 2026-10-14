const createAsyncRouter = require('../../../utils/asyncRouter');
const stationController = require('../../../controllers/admin/stations/stationController');
const { auth, requireRole } = require('../../../middleware/auth');

const router = createAsyncRouter();

router.use(auth, requireRole('ADMIN'));

router.get('/', stationController.getStations);
router.post('/', stationController.createStation);
router.post('/import-osm', stationController.importOSM);
router.get('/:id', stationController.getStationById);
router.put('/:id', stationController.updateStation);
router.delete('/:id', stationController.deleteStation);
router.put('/:id/verify', stationController.verifyStation);
router.get('/:id/accounts', stationController.getStationAccounts);
router.post('/:id/accounts', stationController.createStationAccount);

module.exports = router;
