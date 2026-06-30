const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Derive a 32-byte key from ENCRYPTION_KEY (or fallback to a hash of a hardcoded string).
 * Uses PBKDF2 so the stored encryption key can be any length.
 */
function deriveKey() {
  const secret = process.env.ENCRYPTION_KEY || 'mongo-vault-default-key-change-me-in-production!!';
  // Use a fixed salt so the derived key is deterministic for a given ENCRYPTION_KEY
  const salt = Buffer.from('mongo-vault-enc-salt-v1', 'utf8');
  return crypto.pbkdf2Sync(secret, salt, 10000, 32, 'sha256');
}

let _cachedKey = null;
function getKey() {
  if (!_cachedKey) _cachedKey = deriveKey();
  return _cachedKey;
}

/**
 * Encrypt a plaintext string.
 * Returns: base64( iv + ciphertext + authTag )
 */
function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string previously encrypted with encrypt().
 * Input format: hex( iv:authTag:ciphertext )
 * Returns null if decryption fails (e.g. wrong key, corrupted data).
 */
function decrypt(encoded) {
  if (!encoded) return encoded;
  try {
    const key = getKey();
    const parts = encoded.split(':');
    if (parts.length !== 3) {
      console.warn('[crypto] Malformed encrypted value (expected 3 parts)');
      return null;
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.warn('[crypto] Decryption failed:', err.message);
    return null;
  }
}

module.exports = { encrypt, decrypt, deriveKey };
