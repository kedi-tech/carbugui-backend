const createAsyncRouter = require('../../utils/asyncRouter');
const djomyController = require('../../controllers/webhooks/djomyController');

const router = createAsyncRouter();

// URL à déclarer dans l'espace développeur Djomy :
//   https://<domaine>/api/v1/webhooks/djomy
router.post('/djomy', djomyController.handleDjomyWebhook);

module.exports = router;
