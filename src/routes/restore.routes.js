const express = require('express');
const router = express.Router();
const restoreController = require('../controllers/restore.controller');

router.post('/trigger', restoreController.triggerRestore);
router.get('/progress/:jobId', restoreController.streamProgress);
router.get('/status', restoreController.getStatus);
router.post('/clear', restoreController.clearRestoreJob);

module.exports = router;
