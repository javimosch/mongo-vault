const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

/**
 * Get the encryption key, supporting both new and legacy env var names.
 * Priority: ENCRYPTION_KEY > SUPERBACKEND_ENCRYPTION_KEY > SAASBACKEND_ENCRYPTION_KEY
 *
 * Compatible with superbackend's key format:
 * - 64 hex chars → raw 32 bytes
 * - base64-decoded → 32 bytes
 * - 32+ char UTF-8 string → sliced to 32 bytes
 */
function getRawKey() {
  const secret = process.env.ENCRYPTION_KEY
    || process.env.SUPERBACKEND_ENCRYPTION_KEY
    || process.env.SAASBACKEND_ENCRYPTION_KEY
    || 'mongo-vault-default-key-change-me-in-production!!';

  let key;
  if (/^[A-Fa-f0-9]{64}$/.test(secret)) {
    key = Buffer.from(secret, 'hex');
  } else {
    try {
      key = Buffer.from(secret, 'base64');
    } catch {
      key = null;
    }
    if (!key || key.length !== 32) {
      key = Buffer.from(secret, 'utf8').slice(0, 32);
    }
  }
  return key;
}

let _cachedKey = null;
function getKey() {
  if (!_cachedKey) _cachedKey = getRawKey();
  return _cachedKey;
}

/**
 * Encrypt plaintext → hex( iv:authTag:ciphertext )
 * This is the mongo-vault native format (cleaner, no base64 padding issues).
 */
function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypt a value that was stored as type='encrypted'.
 * Tries formats in order:
 *   1. Superbackend JSON format  → { alg, iv, tag, ciphertext } (base64)
 *   2. Native hex format         → hex(iv):hex(tag):hex(ciphertext)
 */
function decrypt(encoded) {
  if (!encoded) return encoded;

  // Try superbackend JSON format first
  if (encoded.startsWith('{')) {
    try {
      const payload = JSON.parse(encoded);
      if (payload.alg === 'aes-256-gcm' && payload.iv && payload.tag && payload.ciphertext) {
        const key = getKey();
        const iv = Buffer.from(payload.iv, 'base64');
        const tag = Buffer.from(payload.tag, 'base64');
        const ciphertext = Buffer.from(payload.ciphertext, 'base64');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return plaintext.toString('utf8');
      }
    } catch {
      // Not superbackend JSON — fall through to hex format
    }
  }

  // Try native hex format: iv:authTag:ciphertext
  try {
    const parts = encoded.split(':');
    if (parts.length === 3) {
      const key = getKey();
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const ciphertext = Buffer.from(parts[2], 'hex');

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext.toString('utf8');
    }
  } catch {
    // Not hex format either
  }

  console.warn('[crypto] Decryption failed — wrong key or unsupported format');
  return null;
}

module.exports = { encrypt, decrypt };
