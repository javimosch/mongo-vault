const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { Client } = require('ssh2');
const settingsService = require('./settings.service');

const DATA_DIR = path.resolve(process.cwd(), 'data');

const restoreJobs = {};

function getJobId() {
  return `restore-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getJob(jobId) {
  return restoreJobs[jobId] || null;
}

function getAllJobs() {
  return restoreJobs;
}

/**
 * Start a restore job. Returns jobId immediately; progress via EventEmitter.
 * @param {object} opts
 * @param {string} opts.sourceTargetId
 * @param {string} opts.filename
 * @param {object} opts.restoreTarget  - { sshHost, sshUser, containerId, mongoUser, mongoPassword, mongoAuthDb }
 */
async function startRestore({ sourceTargetId, filename, restoreTarget }) {
  const filePath = path.join(DATA_DIR, sourceTargetId, filename);
  if (!fs.existsSync(filePath)) throw new Error(`Backup file not found: ${filename}`);

  const privateKey = await settingsService.getSshKey();
  if (!privateKey) throw new Error('SSH private key not configured. Go to Settings to add it.');

  const { sshHost, sshUser, containerId, mongoUser, mongoPassword, mongoAuthDb = 'admin' } = restoreTarget;
  if (!sshHost || !sshUser || !containerId) {
    throw new Error('restoreTarget must include sshHost, sshUser and containerId');
  }

  const jobId = getJobId();
  const emitter = new EventEmitter();

  restoreJobs[jobId] = {
    jobId,
    sourceTargetId,
    filename,
    restoreTarget,
    status: 'running',
    startedAt: new Date(),
    finishedAt: null,
    error: null,
    progress: [],
    emitter,
  };

  _runRestore({ jobId, filePath, privateKey, sshHost, sshUser, containerId, mongoUser, mongoPassword, mongoAuthDb, restoreTarget, emitter });

  return jobId;
}

function _runRestore({ jobId, filePath, privateKey, sshHost, sshUser, containerId, mongoUser, mongoPassword, mongoAuthDb, restoreTarget, emitter }) {
  const job = restoreJobs[jobId];

  const command = [
    `docker exec -i ${containerId}`,
    `mongorestore`,
    `--host 127.0.0.1`,
    mongoUser ? `--username ${mongoUser}` : '',
    mongoPassword ? `--password ${mongoPassword}` : '',
    `--authenticationDatabase ${mongoAuthDb}`,
    restoreTarget.protectAdminDb ? `--nsExclude "admin.*"` : '',
    `--archive --gzip --drop`,
  ].filter(Boolean).join(' ');

  const conn = new Client();

  conn.on('ready', () => {
    emitter.emit('progress', `[restore] SSH connected to ${sshHost}`);
    emitter.emit('progress', `[restore] Running: ${command}`);

    conn.exec(command, (err, stream) => {
      if (err) {
        conn.end();
        _finishJob(jobId, err.message, emitter);
        return;
      }

      const fileStream = fs.createReadStream(filePath);

      stream.on('close', (code) => {
        conn.end();
        if (code !== 0) {
          _finishJob(jobId, `mongorestore exited with code ${code}`, emitter);
        } else {
          _finishJob(jobId, null, emitter);
        }
      });

      stream.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach((l) => {
          // Store in job history
          const job = restoreJobs[jobId];
          if (job && job.progress) {
            job.progress.push(l);
          }
          emitter.emit('progress', l);
        });
      });

      stream.on('error', (err) => {
        conn.end();
        _finishJob(jobId, err.message, emitter);
      });

      fileStream.on('error', (err) => {
        conn.end();
        _finishJob(jobId, `File read error: ${err.message}`, emitter);
      });

      fileStream.on('end', () => {
        stream.stdin.end();
      });

      fileStream.pipe(stream.stdin, { end: false });
    });
  });

  conn.on('error', (err) => {
    _finishJob(jobId, `SSH error: ${err.message}`, emitter);
  });

  conn.connect({
    host: sshHost,
    port: 22,
    username: sshUser,
    privateKey,
    readyTimeout: 20000,
  });
}

function _finishJob(jobId, errorMsg, emitter) {
  const job = restoreJobs[jobId];
  if (!job) return;
  job.finishedAt = new Date();
  if (errorMsg) {
    job.status = 'error';
    job.error = errorMsg;
    const msg = `[restore] ERROR: ${errorMsg}`;
    if (job.progress) job.progress.push(msg);
    emitter.emit('progress', msg);
  } else {
    job.status = 'success';
    const msg = '[restore] Restore completed successfully.';
    if (job.progress) job.progress.push(msg);
    emitter.emit('progress', msg);
  }
  console.log(`[restore-service] Job ${jobId} status updated to: ${job.status}`);
  // Audit logging for completion
  try {
    const { createAuditEvent } = require('@intranefr/superbackend/src/services/audit.service');
    createAuditEvent({
      actorType: 'system',
      actorId: 'restore-service',
      action: errorMsg ? 'restore.error' : 'restore.complete',
      entityType: 'backup',
      entityId: `${job.sourceTargetId}:${job.filename}`,
      meta: {
        jobId,
        sourceTargetId: job.sourceTargetId,
        filename: job.filename,
        status: job.status,
        error: job.error,
        restoreTarget: {
          sshHost: job.restoreTarget?.sshHost,
          sshUser: job.restoreTarget?.sshUser,
          containerId: job.restoreTarget?.containerId,
          mongoUser: job.restoreTarget?.mongoUser,
        }
      }
    }).catch(err => console.error('[restore-service] Failed to log audit event:', err));
  } catch (err) {
    console.error('[restore-service] Audit service not available:', err);
  }
  
  emitter.emit('done', { status: job.status, error: job.error });
}

function removeJob(jobId) {
  if (restoreJobs[jobId]) {
    delete restoreJobs[jobId];
  }
}

module.exports = { startRestore, getJob, getAllJobs, removeJob };
