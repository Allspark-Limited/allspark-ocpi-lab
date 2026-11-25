import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { config, hashSecret } from './config.ts';

export type EncryptedValue = { ciphertext: string; iv: string; tag: string };

function key(): Buffer {
  return Buffer.from(config().LAB_MASTER_KEY, 'hex');
}

export function freshToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function encrypt(value: string, context: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  };
}

export function decrypt(value: EncryptedValue, context: string): string {
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(value.iv, 'base64url'));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
  return decipher.update(value.ciphertext, 'base64url', 'utf8') + decipher.final('utf8');
}

export function tokenMatches(candidate: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSecret(candidate), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function tokenHint(token: string): string {
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
