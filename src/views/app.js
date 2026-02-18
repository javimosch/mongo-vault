const { createApp, ref, onMounted, watch, nextTick } = Vue;

createApp({
  setup() {
    const tab = ref('dashboard');
    const toast = ref(null);

    // Dashboard
    const dashData = ref([]);
    const dashLoading = ref(false);
    const restoreJobs = ref([]);
    let restoreJobsTimer = null;

    // Targets
    const targets = ref([]);
    const targetsLoading = ref(false);
    const editTarget = ref({});
    const targetSaving = ref(false);
    const targetError = ref('');

    // Restore
    const restoreCtx = ref({ sourceTargetId: '', filename: '', mode: 'existing', existingTargetId: '', custom: { sshHost: '127.0.0.1', sshUser: '', containerId: 'mongo-restore-test', mongoUser: 'root', mongoPassword: '', mongoAuthDb: 'admin' }, protectAdminDb: true, isReconnect: false, reconnectTarget: null, log: [], running: false, done: false, error: null });

    // Audit
    const auditEvents = ref([]);
    const auditLoading = ref(false);
    const auditFilters = ref({ action: '', outcome: '', dateRange: '' });

    function openRestoreModal(targetId, filename) {
      restoreCtx.value = { sourceTargetId: targetId, filename, mode: 'existing', existingTargetId: targets.value[0]?.id || '', custom: { sshHost: '127.0.0.1', sshUser: '', containerId: 'mongo-restore-test', mongoUser: 'root', mongoPassword: '', mongoAuthDb: 'admin' }, protectAdminDb: true, isReconnect: false, reconnectTarget: null, log: [], running: false, done: false, error: null };
      if (!targets.value.length) loadTargets();
      document.getElementById('restore-modal').showModal();
    }

    function reconnectJob(job) {
      const ctx = restoreCtx.value;
      const log = [`[restore] Reconnecting to job ${job.jobId}…`];
      // Load existing progress if available
      if (job.progress && job.progress.length > 0) {
        log.push(...job.progress);
      }
      Object.assign(ctx, { 
        sourceTargetId: job.sourceTargetId, 
        filename: job.filename, 
        mode: 'existing', 
        isReconnect: true,
        reconnectTarget: job.restoreTarget || null,
        log, 
        running: job.status === 'running', 
        done: job.status !== 'running', 
        error: job.error || null 
      });
      document.getElementById('restore-modal').showModal();
      if (job.status !== 'running') return;
      const es = new EventSource(`/api/restores/progress/${job.jobId}`);
      es.onmessage = (e) => {
        const d = JSON.parse(e.data);
        if (d.line) ctx.log.push(d.line);
        if (d.done) { ctx.running = false; ctx.done = true; ctx.error = d.error || null; es.close(); loadRestoreJobs(); }
      };
      es.onerror = () => { ctx.running = false; ctx.done = true; ctx.error = 'SSE connection lost'; es.close(); };
    }

    function closeRestoreModal() {
      document.getElementById('restore-modal').close();
      // Refresh jobs list in case status wasn't updated via SSE
      loadRestoreJobs();
    }

    async function runRestore() {
      const ctx = restoreCtx.value;
      let restoreTarget;
      if (ctx.mode === 'existing') {
        const t = targets.value.find(x => x.id === ctx.existingTargetId);
        if (!t) return showToast('Select a target', false);
        restoreTarget = { sshHost: t.sshHost, sshUser: t.sshUser, containerId: t.containerId, mongoUser: t.mongoUser, mongoPassword: t.mongoPassword, mongoAuthDb: t.mongoAuthDb, protectAdminDb: ctx.protectAdminDb };
      } else {
        restoreTarget = { ...ctx.custom, protectAdminDb: ctx.protectAdminDb };
      }
      ctx.running = true;
      ctx.log = [];
      ctx.done = false;
      ctx.error = null;
      try {
        const r = await fetch('/api/restores/trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceTargetId: ctx.sourceTargetId, filename: ctx.filename, restoreTarget }) });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        const jobId = json.jobId;
        const es = new EventSource(`/api/restores/progress/${jobId}`);
        es.onmessage = (e) => {
          const d = JSON.parse(e.data);
          if (d.line) ctx.log.push(d.line);
          if (d.done) { ctx.running = false; ctx.done = true; ctx.error = d.error || null; es.close(); loadRestoreJobs(); }
        };
        es.onerror = () => { ctx.running = false; ctx.done = true; ctx.error = 'SSE connection lost'; es.close(); };
      } catch (e) {
        ctx.running = false;
        ctx.done = true;
        ctx.error = e.message;
      }
    }

    async function loadRestoreJobs() {
      try {
        const r = await fetch('/api/restores/status');
        const json = await r.json();
        restoreJobs.value = (json.jobs || []).slice().reverse();
        console.log(`[app] Loaded ${restoreJobs.value.length} restore jobs`);
      } catch (e) {
        console.error('[app] Failed to load restore jobs:', e);
      }
    }

    async function loadAuditEvents() {
      auditLoading.value = true;
      try {
        // Wait for saasbackend connection if needed
        if (globalThis.saasbackend.connectionPromise) {
          await globalThis.saasbackend.connectionPromise;
        }
        
        // Use saasbackend audit service directly instead of HTTP API
        const { AuditEvent } = globalThis.saasbackend.models;
        const mongoose = globalThis.saasbackend.mongoose;
        
        const filter = {};
        
        if (auditFilters.value.action) {
          filter.action = { $regex: auditFilters.value.action, $options: 'i' };
        }
        
        if (auditFilters.value.outcome) {
          filter.outcome = auditFilters.value.outcome;
        }
        
        if (auditFilters.value.dateRange) {
          const now = new Date();
          const fromDate = auditFilters.value.dateRange === '24h' 
            ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
            : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          filter.createdAt = { $gte: fromDate };
        }
        
        // Filter for restore-related actions if no specific action is set
        if (!auditFilters.value.action) {
          filter.action = { $regex: '^restore\\.', $options: 'i' };
        }
        
        const events = await AuditEvent.find(filter)
          .populate('actorUserId', 'email')
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();
        
        // Normalize events to match expected format
        auditEvents.value = events.map(evt => ({
          ...evt,
          id: evt._id,
          at: evt.createdAt,
          details: evt.details || evt.meta
        }));
        
      } catch (e) {
        console.error('[app] Failed to load audit events:', e);
        showToast('Failed to load audit events', false);
      } finally {
        auditLoading.value = false;
      }
    }

    function applyAuditFilters() {
      loadAuditEvents();
    }

    async function clearRestoreJob(jobId) {
      if (!confirm(`Clear restore job ${jobId}?`)) return;
      try {
        const r = await fetch('/api/restores/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId }) });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        showToast('Restore job cleared');
        loadRestoreJobs();
      } catch (e) {
        showToast(e.message, false);
      }
    }

    // Settings
    const sshKeyInput = ref('');
    const sshKeyStatus = ref(null);
    const sshKeySaving = ref(false);
    const sshKeyMsg = ref(null);

    function showToast(text, ok = true) {
      toast.value = { text, ok };
      setTimeout(() => { toast.value = null; }, 3000);
    }

    function formatDate(d) {
      if (!d) return '-';
      return new Date(d).toLocaleString();
    }

    function relativeTime(dateStr) {
      if (!dateStr) return '';
      const now = new Date();
      const target = new Date(dateStr);
      const diffMs = target - now;
      if (diffMs < 0) return '';
      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      if (diffHrs > 0) return `in ${diffHrs}h${diffMins ? ` ${diffMins}m` : ''}`;
      if (diffMins > 0) return `in ${diffMins}m`;
      return 'in <1m';
    }

    function formatSize(bytes) {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function statusBadgeClass(status) {
      if (status === 'success') return 'badge-success';
      if (status === 'error') return 'badge-error';
      if (status === 'running') return 'badge-warning';
      return 'badge-ghost';
    }

    async function loadDashboard() {
      dashLoading.value = true;
      try {
        const r = await fetch('/api/backups');
        const json = await r.json();
        dashData.value = json.data || [];
      } catch (e) {
        showToast('Failed to load dashboard', false);
      } finally {
        dashLoading.value = false;
      }
    }

    async function triggerBackup(targetId) {
      try {
        const r = await fetch(`/api/backups/trigger/${targetId}`, { method: 'POST' });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        showToast('Backup started');
        setTimeout(loadDashboard, 1500);
      } catch (e) {
        showToast(e.message, false);
      }
    }

    function downloadBackup(targetId, filename) {
      // Create a temporary link element to trigger download
      const link = document.createElement('a');
      link.href = `/api/backups/download/${targetId}/${filename}`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    async function deleteBackup(targetId, filename) {
      if (!confirm(`Delete backup ${filename}?`)) return;
      try {
        const r = await fetch(`/api/backups/${targetId}/${filename}`, { method: 'DELETE' });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        showToast('Backup deleted');
        loadDashboard();
      } catch (e) {
        showToast(e.message, false);
      }
    }

    async function loadTargets() {
      targetsLoading.value = true;
      try {
        const r = await fetch('/api/targets');
        const json = await r.json();
        targets.value = json.targets || [];
      } catch (e) {
        showToast('Failed to load targets', false);
      } finally {
        targetsLoading.value = false;
      }
    }

    function openTargetModal(t) {
      targetError.value = '';
      editTarget.value = t ? { ...t } : {
        label: '', sshHost: '', sshUser: 'root', containerId: '',
        mongoUser: '', mongoPassword: '', mongoAuthDb: 'admin',
        cron: '0 2 * * *', retentionCount: 7, enabled: true
      };
      document.getElementById('target-modal').showModal();
    }

    function closeTargetModal() {
      document.getElementById('target-modal').close();
    }

    async function saveTarget() {
      targetSaving.value = true;
      targetError.value = '';
      try {
        const r = await fetch('/api/targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editTarget.value),
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        showToast('Target saved');
        closeTargetModal();
        loadTargets();
      } catch (e) {
        targetError.value = e.message;
      } finally {
        targetSaving.value = false;
      }
    }

    async function deleteTarget(id) {
      if (!confirm('Delete this target? Backup files will remain.')) return;
      try {
        const r = await fetch(`/api/targets/${id}`, { method: 'DELETE' });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        showToast('Target deleted');
        loadTargets();
      } catch (e) {
        showToast(e.message, false);
      }
    }

    async function loadSshKeyStatus() {
      try {
        const r = await fetch('/api/settings/ssh-key');
        const json = await r.json();
        sshKeyStatus.value = json.hasKey;
      } catch {}
    }

    async function saveSshKey() {
      sshKeySaving.value = true;
      sshKeyMsg.value = null;
      try {
        const r = await fetch('/api/settings/ssh-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ privateKey: sshKeyInput.value }),
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        sshKeyMsg.value = { ok: true, text: 'SSH key saved successfully.' };
        sshKeyInput.value = '';
        sshKeyStatus.value = true;
      } catch (e) {
        sshKeyMsg.value = { ok: false, text: e.message };
      } finally {
        sshKeySaving.value = false;
      }
    }

    watch(tab, (t) => {
      if (t === 'dashboard') { loadDashboard(); loadRestoreJobs(); startRestorePoller(); }
      if (t === 'targets') { loadTargets(); stopRestorePoller(); }
      if (t === 'audit') { loadAuditEvents(); stopRestorePoller(); }
      if (t === 'settings') { loadSshKeyStatus(); stopRestorePoller(); }
    });

    function startRestorePoller() {
      stopRestorePoller();
      restoreJobsTimer = setInterval(loadRestoreJobs, 3000);
    }

    function stopRestorePoller() {
      if (restoreJobsTimer) { clearInterval(restoreJobsTimer); restoreJobsTimer = null; }
    }

    // Auto-scroll progress to bottom
    const progressTextarea = ref(null);
    watch(() => restoreCtx.value.log, () => {
      nextTick(() => {
        if (progressTextarea.value) {
          progressTextarea.value.scrollTop = progressTextarea.value.scrollHeight;
        }
      });
    }, { deep: true });

    onMounted(() => {
      loadDashboard();
      loadRestoreJobs();
      startRestorePoller();
    });

    return {
      tab, toast, dashData, dashLoading, restoreJobs,
      targets, targetsLoading, editTarget, targetSaving, targetError,
      sshKeyInput, sshKeyStatus, sshKeySaving, sshKeyMsg,
      restoreCtx, openRestoreModal, closeRestoreModal, runRestore, reconnectJob, clearRestoreJob,
      auditEvents, auditLoading, auditFilters, loadAuditEvents, applyAuditFilters,
      formatDate, formatSize, statusBadgeClass, relativeTime,
      loadDashboard, triggerBackup, downloadBackup, deleteBackup,
      loadTargets, openTargetModal, closeTargetModal, saveTarget, deleteTarget,
      loadSshKeyStatus, saveSshKey,
      progressTextarea,
    };
  }
}).mount('#app');
