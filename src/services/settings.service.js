const GlobalSetting = require('../models/GlobalSetting');
const { encrypt, decrypt } = require('./crypto.service');

const CACHE_TTL = 60000;
const cache = new Map();

async function getRaw(key, opts = {}) {
  const cacheKey = `${key}:${opts.decrypt || false}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.value;
  try {
    const doc = await GlobalSetting.findOne({ key }).lean();
    if (!doc) return null;
    let value = doc.value;
    // Decrypt if the value was stored as encrypted
    if (doc.type === 'encrypted' && opts.decrypt !== false) {
      const decrypted = decrypt(doc.value);
      if (decrypted !== null) {
        value = decrypted;
      } else {
        // Decryption failed — value may be from superbackend or corrupted.
        // Return raw value with a warning; the caller should re-encrypt on next write.
        console.warn(`[settings] Value for "${key}" is encrypted but decryption failed. Returning raw.`);
      }
    }
    cache.set(cacheKey, { value, ts: Date.now() });
    return value;
  } catch (e) {
    console.error(`[settings] getRaw error for ${key}:`, e.message);
    return null;
  }
}

async function setRaw(key, value, type = 'string', opts = {}) {
  // Clear all cache entries for this key (including decrypt variants)
  for (const k of cache.keys()) {
    if (k.startsWith(key)) cache.delete(k);
  }
  // Encrypt sensitive values automatically
  if (opts.encrypt !== false && (type === 'encrypted' || key.startsWith('ssh.'))) {
    value = encrypt(String(value));
    type = 'encrypted';
  }
  await GlobalSetting.findOneAndUpdate(
    { key },
    { $set: { value: String(value), type }, $setOnInsert: { description: key } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function deleteKey(key) {
  for (const k of cache.keys()) {
    if (k.startsWith(key)) cache.delete(k);
  }
  await GlobalSetting.deleteOne({ key });
}

async function getAllTargets() {
  try {
    const docs = await GlobalSetting.find({ key: /^target\./ }).lean();
    return docs.map((d) => {
      try { return JSON.parse(d.value); } catch { return null; }
    }).filter(Boolean);
  } catch (e) {
    console.error('[settings] getAllTargets error:', e.message);
    return [];
  }
}

async function getTarget(id) {
  const raw = await getRaw(`target.${id}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function saveTarget(target) {
  if (!target.id) throw new Error('Target must have an id');
  const prefix = `target.${target.id}`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
  await setRaw(`target.${target.id}`, JSON.stringify(target), 'json');
}

async function deleteTarget(id) {
  await deleteKey(`target.${id}`);
}

async function getSshKey() {
  const raw = await getRaw('ssh.privateKey');
  return raw || null;
}

async function setSshKey(keyContent) {
  cache.delete('ssh.privateKey');
  await setRaw('ssh.privateKey', keyContent, 'string');
}

async function hasSshKey() {
  const key = await getSshKey();
  return !!key && key.trim().length > 0;
}

module.exports = {
  getAllTargets,
  getTarget,
  saveTarget,
  deleteTarget,
  getSshKey,
  setSshKey,
  hasSshKey,
};
