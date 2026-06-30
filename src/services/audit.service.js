const AuditEvent = require('../models/AuditEvent');

/**
 * Create an audit event asynchronously (fire-and-forget).
 */
async function createAuditEvent({ actorType, actorUserId, actorId, action, entityType, entityId, meta, outcome, error }) {
  try {
    await AuditEvent.create({
      actorType: actorType || 'system',
      actorUserId: actorUserId || null,
      actorId: actorId || 'mongo-vault',
      action: action || 'unknown',
      entityType: entityType || null,
      entityId: entityId || null,
      meta: meta || null,
      outcome: outcome || 'success',
      before: null,
      after: null,
      context: {},
    });
  } catch (err) {
    console.error('[audit] Failed to create audit event:', err.message);
  }
}

/**
 * Get basic auth actor info from Express request.
 */
function getBasicAuthActor(req) {
  const authHeader = req.headers?.authorization || '';
  if (authHeader.startsWith('Basic ')) {
    try {
      const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf-8');
      const [username] = credentials.split(':');
      return {
        actorType: 'admin_basic',
        actorUserId: null,
        actorId: username || 'admin',
      };
    } catch {
      // fall through
    }
  }
  return {
    actorType: 'admin_basic',
    actorUserId: null,
    actorId: 'admin',
  };
}

module.exports = { createAuditEvent, getBasicAuthActor };
