const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/settings.controller');

router.get('/ssh-key', ctrl.getSshKeyStatus);
router.post('/ssh-key', ctrl.setSshKey);

module.exports = router;
