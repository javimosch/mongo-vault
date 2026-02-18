const cron = require('node-cron');
const settingsService = require('./settings.service');
const backupService = require('./backup.service');

const jobs = {};
const nextRuns = {};

function computeNextRun(cronExpr) {
  try {
    const parser = require('cron-parser');
    const interval = parser.parseExpression(cronExpr);
    return interval.next().toDate();
  } catch {
    return null;
  }
}

function stopJob(targetId) {
  if (jobs[targetId]) {
    jobs[targetId].stop();
    delete jobs[targetId];
    delete nextRuns[targetId];
    console.log(`[scheduler] Stopped job for target: ${targetId}`);
  }
}

function startJob(target) {
  stopJob(target.id);
  if (!target.enabled) return;

  const cronExpr = target.cron || '0 2 * * *';
  if (!cron.validate(cronExpr)) {
    console.warn(`[scheduler] Invalid cron expression for target ${target.id}: ${cronExpr}`);
    return;
  }

  nextRuns[target.id] = computeNextRun(cronExpr);

  jobs[target.id] = cron.schedule(cronExpr, async () => {
    console.log(`[scheduler] Running scheduled backup for target: ${target.id}`);
    nextRuns[target.id] = computeNextRun(cronExpr);
    try {
      const freshTarget = await settingsService.getTarget(target.id);
      if (!freshTarget || !freshTarget.enabled) {
        console.log(`[scheduler] Target ${target.id} disabled or removed, skipping.`);
        return;
      }
      await backupService.runBackup(freshTarget);
    } catch (err) {
      console.error(`[scheduler] Backup failed for target ${target.id}:`, err.message);
    }
  });

  console.log(`[scheduler] Scheduled backup for target ${target.id} with cron: ${cronExpr}`);
}

async function init() {
  const targets = await settingsService.getAllTargets();
  for (const target of targets) {
    startJob(target);
  }
  console.log(`[scheduler] Initialized ${targets.length} scheduled job(s).`);
}

function reinitTarget(target) {
  if (target.enabled) {
    startJob(target);
  } else {
    stopJob(target.id);
  }
}

function removeTarget(targetId) {
  stopJob(targetId);
}

function getNextRun(targetId) {
  return nextRuns[targetId] || null;
}

function getAllNextRuns() {
  return { ...nextRuns };
}

module.exports = { init, reinitTarget, removeTarget, getNextRun, getAllNextRuns };
