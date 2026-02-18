const settingsService = require('../services/settings.service');

async function getSshKeyStatus(req, res) {
  try {
    const has = await settingsService.hasSshKey();
    res.json({ hasKey: has });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function setSshKey(req, res) {
  try {
    const { privateKey } = req.body;
    if (!privateKey || !privateKey.trim()) {
      return res.status(400).json({ error: 'privateKey is required' });
    }
    await settingsService.setSshKey(privateKey.trim());
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getSshKeyStatus, setSshKey };
