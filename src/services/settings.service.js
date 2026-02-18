const CACHE_TTL = 60000;
const cache = new Map();

function getModel() {
  const isDev = process.env.NODE_ENV !== 'production';
  let GlobalSetting;
  if (isDev) {
    try {
      GlobalSetting = require('../../ref-saasbackend/src/models/GlobalSetting');
    } catch {
      GlobalSetting = require('@intranefr/superbackend/src/models/GlobalSetting');
    }
  } else {
    GlobalSetting = require('@intranefr/superbackend/src/models/GlobalSetting');
  }
  return GlobalSetting;
}

async function getRaw(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.value;
  try {
    const doc = await getModel().findOne({ key }).lean();
    const value = doc ? doc.value : null;
    cache.set(key, { value, ts: Date.now() });
    return value;
  } catch (e) {
    console.error(`[settings] getRaw error for ${key}:`, e.message);
    return null;
  }
}

async function setRaw(key, value, type = 'string') {
  cache.delete(key);
  await getModel().findOneAndUpdate(
    { key },
    { $set: { value: String(value), type }, $setOnInsert: { description: key } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function deleteKey(key) {
  cache.delete(key);
  await getModel().deleteOne({ key });
}

async function getAllTargets() {
  try {
    const docs = await getModel().find({ key: /^target\./ }).lean();
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
  cache.delete(`target.${target.id}`);
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
