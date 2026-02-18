const backupService = require('../services/backup.service');
const settingsService = require('../services/settings.service');
const scheduler = require('../services/scheduler.service');

async function listBackups(req, res) {
  try {
    const all = backupService.listAllBackups();
    const targets = await settingsService.getAllTargets();
    const nextRuns = scheduler.getAllNextRuns();
    const allStatus = backupService.getAllStatus();

    const result = targets.map((t) => ({
      target: t,
      backups: all[t.id] || [],
      status: allStatus[t.id] || { status: 'idle' },
      nextRun: nextRuns[t.id] || null,
    }));

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function triggerBackup(req, res) {
  const { targetId } = req.params;
  try {
    const target = await settingsService.getTarget(targetId);
    if (!target) return res.status(404).json({ error: 'Target not found' });

    const current = backupService.getStatus(targetId);
    if (current.status === 'running') {
      return res.status(409).json({ error: 'Backup already running for this target' });
    }

    backupService.runBackup(target).catch((err) => {
      console.error(`[backup] Async trigger failed for ${targetId}:`, err.message);
    });

    res.json({ ok: true, message: 'Backup started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteBackup(req, res) {
  const { targetId, filename } = req.params;
  try {
    backupService.deleteBackupFile(targetId, filename);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getStatus(req, res) {
  try {
    const allStatus = backupService.getAllStatus();
    const nextRuns = scheduler.getAllNextRuns();
    res.json({ status: allStatus, nextRuns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listBackups, triggerBackup, deleteBackup, getStatus };
