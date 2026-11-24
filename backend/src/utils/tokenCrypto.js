/**
 * AES-256-GCM for OAuth tokens at rest. Key comes from TOKEN_ENCRYPTION_KEY
 * (any string; it is hashed to 32 bytes) and falls back to JWT_SECRET so a
 * personal install works without another setting.
 */
const crypto = require('crypto');

function key() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY or JWT_SECRET must be set to store Google tokens');
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(plain) {
  if (plain === null || plain === undefined) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map(b => b.toString('base64')).join('.');
}

function decrypt(payload) {
  if (!payload) return null;
  const [iv, tag, enc] = payload.split('.').map(p => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
