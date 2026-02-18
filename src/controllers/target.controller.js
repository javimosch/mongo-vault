const settingsService = require('../services/settings.service');
const scheduler = require('../services/scheduler.service');
const { v4: uuidv4 } = require('uuid');

async function listTargets(req, res) {
  try {
    const targets = await settingsService.getAllTargets();
    res.json({ targets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function saveTarget(req, res) {
  try {
    const body = req.body;
    if (!body.sshHost || !body.sshUser || !body.containerId) {
      return res.status(400).json({ error: 'sshHost, sshUser and containerId are required' });
    }
    if (!body.id) {
      body.id = uuidv4().slice(0, 8);
    }
    body.retentionCount = parseInt(body.retentionCount, 10) || 7;
    body.enabled = body.enabled !== false && body.enabled !== 'false';

    await settingsService.saveTarget(body);
    scheduler.reinitTarget(body);
    res.json({ target: body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteTarget(req, res) {
  try {
    const { id } = req.params;
    await settingsService.deleteTarget(id);
    scheduler.removeTarget(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listTargets, saveTarget, deleteTarget };
