const settingsService = require("../services/settings.service");
const scheduler = require("../services/scheduler.service");
const sshService = require("../services/ssh.service");
const { v4: uuidv4 } = require("uuid");

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
      return res
        .status(400)
        .json({ error: "sshHost, sshUser and containerId are required" });
    }
    if (!body.id) {
      body.id = uuidv4().slice(0, 8);
    }
    body.retentionCount = parseInt(body.retentionCount, 10) || 7;
    body.enabled = body.enabled !== false && body.enabled !== "false";

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

async function checkDiskUsage(req, res) {
  try {
    const { id } = req.params;
    const target = await settingsService.getTarget(id);
    if (!target) return res.status(404).json({ error: "Target not found" });

    const privateKey = await settingsService.getSshKey();
    if (!privateKey)
      return res.status(400).json({ error: "SSH key not configured" });

    // df -h command to get human readable disk usage of the mongodb data directory
    const { stdout, stderr, exitCode } = await sshService.execCommand({
      host: target.sshHost,
      user: target.sshUser,
      privateKey,
      command: "df -h /data/db | tail -1 | awk '{print $2, $3, $4, $5}'",
    });

    if (exitCode !== 0) {
      return res.status(500).json({ error: `SSH Command failed: ${stderr}` });
    }

    const [size, used, avail, usePercent] = stdout.trim().split(/\s+/);
    res.json({ size, used, avail, usePercent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listTargets, saveTarget, deleteTarget, checkDiskUsage };
