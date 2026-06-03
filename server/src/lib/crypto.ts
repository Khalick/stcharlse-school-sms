import crypto from 'crypto';

/**
 * Hashes a plaintext password using PBKDF2 with SHA-512 and a random salt.
 * Output format: "salt:hash" in hex.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifies a plaintext password against a stored password string.
 * Supports legacy plaintext password comparison for fallback safety.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  
  if (!storedHash.includes(':')) {
    // Legacy plaintext fallback
    return password === storedHash;
  }
  
  const [salt, hash] = storedHash.split(':');
  const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === checkHash;
}
