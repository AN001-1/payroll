import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
const keyLength = 64;
const workFactor = 32768;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, keyLength, { N: workFactor, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt: salt.toString('base64url'), hash: key.toString('base64url') };
}

export async function verifyPassword(password, saltValue, hashValue) {
  if (!saltValue || !hashValue) return false;
  const salt = Buffer.from(saltValue, 'base64url');
  const expected = Buffer.from(hashValue, 'base64url');
  const actual = await deriveKey(password, salt, keyLength, { N: workFactor, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}