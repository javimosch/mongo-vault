const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/target.controller');

router.get('/', ctrl.listTargets);
router.post('/', ctrl.saveTarget);
router.delete('/:id', ctrl.deleteTarget);

module.exports = router;
