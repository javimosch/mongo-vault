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

    // Wait a bit to catch immediate errors (like missing SSH key)
    await new Promise((resolve) => setTimeout(resolve, 500));
    const status = backupService.getStatus(targetId);
    if (status.status === 'error' && status.error) {
      return res.status(500).json({ error: status.error });
    }

    res.json({ ok: true, message: 'Backup started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function downloadBackup(req, res) {
  const { targetId, filename } = req.params;
  try {
    const filePath = backupService.getBackupFilePath(targetId, filename);
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error(`[backup] Download failed for ${targetId}/${filename}:`, err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Download failed' });
        }
      }
    });
  } catch (err) {
    res.status(404).json({ error: err.message });
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

async function getMetrics(req, res) {
  try {
    const hostMetrics = await backupService.getHostMetrics();
    const targets = await settingsService.getAllTargets();
    const targetMetrics = {};

    for (const t of targets) {
      targetMetrics[t.id] = await backupService.getTargetMetrics(t);
    }

    res.json({ host: hostMetrics, targets: targetMetrics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listBackups, triggerBackup, downloadBackup, deleteBackup, getStatus, getMetrics };
