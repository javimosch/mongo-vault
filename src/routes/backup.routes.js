const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/backup.controller');

router.get('/', ctrl.listBackups);
router.get('/status', ctrl.getStatus);
router.post('/trigger/:targetId', ctrl.triggerBackup);
router.get('/download/:targetId/:filename', ctrl.downloadBackup);
router.delete('/:targetId/:filename', ctrl.deleteBackup);

module.exports = router;
