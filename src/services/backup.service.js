const fs = require('fs');
const path = require('path');
const { execOverSsh } = require('./ssh.service');
const settingsService = require('./settings.service');

const DATA_DIR = path.resolve(process.cwd(), 'data');

const runStatus = {};

function getTargetDir(targetId) {
  return path.join(DATA_DIR, targetId);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function listBackups(targetId) {
  const dir = getTargetDir(targetId);
  if (!fs.existsSync(dir)) return [];
  const activeFilename = runStatus[targetId]?.status === 'running' ? runStatus[targetId].filename : null;

  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.gz') && f !== activeFilename)
    .map((f) => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { filename: f, size: stat.size, createdAt: stat.mtime };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

function getBackupFilePath(targetId, filename) {
  // Validate filename to prevent directory traversal
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid filename');
  }
  
  const filePath = path.join(getTargetDir(targetId), filename);
  
  // Ensure file exists and is within the data directory
  if (!fs.existsSync(filePath)) {
    throw new Error('Backup file not found');
  }
  
  // Ensure the resolved path is still within the data directory
  const resolvedPath = path.resolve(filePath);
  const dataDirPath = path.resolve(DATA_DIR);
  if (!resolvedPath.startsWith(dataDirPath)) {
    throw new Error('Access denied');
  }
  
  return filePath;
}

function listAllBackups() {
  if (!fs.existsSync(DATA_DIR)) return {};
  const result = {};
  const dirs = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const id of dirs) {
    result[id] = listBackups(id);
  }
  return result;
}

function applyRotation(targetId, retentionCount) {
  const backups = listBackups(targetId);
  if (backups.length <= retentionCount) return;
  const toDelete = backups.slice(retentionCount);
  for (const b of toDelete) {
    const full = path.join(getTargetDir(targetId), b.filename);
    try {
      fs.unlinkSync(full);
      console.log(`[backup] Rotated out: ${full}`);
    } catch (e) {
      console.error(`[backup] Failed to delete ${full}:`, e.message);
    }
  }
}

function deleteBackupFile(targetId, filename) {
  const full = path.join(getTargetDir(targetId), filename);
  if (!fs.existsSync(full)) throw new Error('File not found');
  fs.unlinkSync(full);
}

async function runBackup(target) {
  const { id, sshHost, sshUser, containerId, mongoUser, mongoPassword, mongoAuthDb, retentionCount = 7 } = target;

  const now = new Date();
  const privateKey = await settingsService.getSshKey();
  if (!privateKey) {
    const err = 'SSH private key not configured. Go to Settings to add it.';
    runStatus[id] = { status: 'error', startedAt: now, finishedAt: new Date(), filename: null, error: err };
    throw new Error(err);
  }

  const targetDir = getTargetDir(id);
  ensureDir(targetDir);

  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `mongo-${ts}.gz`;
  const filePath = path.join(targetDir, filename);

  const command = [
    `docker exec -i ${containerId}`,
    `mongodump`,
    `--username ${mongoUser}`,
    `--password ${mongoPassword}`,
    `--authenticationDatabase ${mongoAuthDb || 'admin'}`,
    `--archive --gzip`,
  ].join(' ');

  runStatus[id] = { status: 'running', startedAt: now, filename, bytesRead: 0, error: null };

  const outStream = fs.createWriteStream(filePath);
  
  // Track bytes written to show progress
  let bytesRead = 0;
  const progressInterval = setInterval(() => {
    if (runStatus[id] && runStatus[id].status === 'running') {
      runStatus[id].bytesRead = bytesRead;
    }
  }, 1000);

  try {
    const { exitCode, stderr } = await execOverSsh({
      host: sshHost,
      user: sshUser,
      privateKey,
      command,
      outStream: {
        write: (chunk) => {
          bytesRead += chunk.length;
          return outStream.write(chunk);
        },
        end: (cb) => {
          clearInterval(progressInterval);
          outStream.end(cb);
        },
        on: (event, cb) => outStream.on(event, cb),
        destroy: () => {
          clearInterval(progressInterval);
          outStream.destroy();
        }
      },
    });

    await new Promise((res) => outStream.end(res));

    if (exitCode !== 0) {
      fs.unlinkSync(filePath);
      const err = `mongodump exited with code ${exitCode}. stderr: ${stderr}`;
      runStatus[id] = { status: 'error', startedAt: now, finishedAt: new Date(), filename: null, error: err };
      throw new Error(err);
    }

    applyRotation(id, retentionCount);

    runStatus[id] = { status: 'success', startedAt: now, finishedAt: new Date(), filename, bytesRead, error: null };
    console.log(`[backup] Completed backup for target ${id}: ${filename}`);
    return { filename };
  } catch (err) {
    try { outStream.destroy(); } catch {}
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
    runStatus[id] = { status: 'error', startedAt: now, finishedAt: new Date(), filename: null, error: err.message };
    throw err;
  }
}

function getStatus(targetId) {
  return runStatus[targetId] || { status: 'idle', startedAt: null, finishedAt: null, filename: null, error: null };
}

function getAllStatus() {
  return runStatus;
}

module.exports = {
  runBackup,
  listBackups,
  listAllBackups,
  getBackupFilePath,
  deleteBackupFile,
  getStatus,
  getAllStatus,
};
