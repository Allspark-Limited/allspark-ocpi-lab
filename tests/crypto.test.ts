import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgresql://unused';
process.env.LAB_MASTER_KEY = '4b658ef21ebfe31d30e6a939d6f6b64e082e3e263417c4f18ab440a54488ffcf';
process.env.LAB_PUBLIC_URL = 'http://localhost:3000';
process.env.LAB_ADMIN_SECRET = 'local-development-only';

test('encrypts with authenticated context and never stores plaintext', async () => {
  const { decrypt, encrypt } = await import('../src/lib/crypto.ts');
  const encrypted = encrypt('secret-token', 'environment-1:B');
  assert.equal(encrypted.ciphertext.includes('secret-token'), false);
  assert.equal(decrypt(encrypted, 'environment-1:B'), 'secret-token');
  assert.throws(() => decrypt(encrypted, 'environment-2:B'));
});

test('compares hashed tokens and produces bounded hints', async () => {
  const { tokenHint, tokenMatches } = await import('../src/lib/crypto.ts');
  const { hashSecret } = await import('../src/lib/config.ts');
  assert.equal(tokenMatches('token-A', hashSecret('token-A')), true);
  assert.equal(tokenMatches('token-B', hashSecret('token-A')), false);
  assert.equal(tokenHint('abcdefghijklmnop'), 'abcd…mnop');
});
