const restoreService = require('../services/restore.service');
const { createAuditEvent, getBasicAuthActor } = require('@intranefr/superbackend/src/services/audit.service');

async function triggerRestore(req, res) {
  try {
    const { sourceTargetId, filename, restoreTarget } = req.body;
    if (!sourceTargetId || !filename || !restoreTarget) {
      return res.status(400).json({ error: 'sourceTargetId, filename and restoreTarget are required' });
    }
    const jobId = await restoreService.startRestore({ sourceTargetId, filename, restoreTarget });
    
    // Audit log
    const actor = getBasicAuthActor(req);
    await createAuditEvent({
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: 'restore.trigger',
      entityType: 'backup',
      entityId: `${sourceTargetId}:${filename}`,
      meta: {
        jobId,
        sourceTargetId,
        filename,
        restoreTarget: {
          sshHost: restoreTarget.sshHost,
          sshUser: restoreTarget.sshUser,
          containerId: restoreTarget.containerId,
          mongoUser: restoreTarget.mongoUser,
        }
      }
    });
    
    res.json({ ok: true, jobId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function streamProgress(req, res) {
  const { jobId } = req.params;
  const job = restoreService.getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (line) => {
    res.write(`data: ${JSON.stringify({ line })}\n\n`);
  };

  if (job.status !== 'running') {
    send(`[restore] Job already finished with status: ${job.status}`);
    if (job.error) send(`[restore] Error: ${job.error}`);
    res.write(`data: ${JSON.stringify({ done: true, status: job.status })}\n\n`);
    return res.end();
  }

  job.emitter.on('progress', send);

  const onDone = (data) => {
    res.write(`data: ${JSON.stringify({ done: true, status: data.status, error: data.error })}\n\n`);
    cleanup();
    res.end();
  };

  job.emitter.once('done', onDone);

  function cleanup() {
    job.emitter.off('progress', send);
    job.emitter.off('done', onDone);
  }

  req.on('close', cleanup);
}

function getStatus(req, res) {
  try {
    const jobs = restoreService.getAllJobs();
    const summary = Object.values(jobs).map(({ jobId, sourceTargetId, filename, status, startedAt, finishedAt, error, restoreTarget, progress }) => ({
      jobId, sourceTargetId, filename, status, startedAt, finishedAt, error, restoreTarget, progress,
    }));
    res.json({ jobs: summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function clearRestoreJob(req, res) {
  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ error: 'jobId required' });
  if (restoreService.getJob(jobId)) {
    restoreService.removeJob(jobId);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Job not found' });
  }
}

module.exports = { 
  triggerRestore, 
  streamProgress: streamProgress, 
  getStatus: getStatus, 
  clearRestoreJob 
};
