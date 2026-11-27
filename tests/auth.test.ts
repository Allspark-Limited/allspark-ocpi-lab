import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgresql://unused';
process.env.LAB_MASTER_KEY = '4b658ef21ebfe31d30e6a939d6f6b64e082e3e263417c4f18ab440a54488ffcf';
process.env.LAB_PUBLIC_URL = 'http://localhost:3000';
process.env.LAB_ADMIN_SECRET = 'local-development-only';

test('password hashing uses salted scrypt and verifies in constant time', async () => {
  const { hashPasswordForTest, verifyPasswordForTest } = await import('../src/lib/auth.ts');
  const hash = hashPasswordForTest('correct horse battery staple');
  assert.match(hash, /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.notEqual(hash, hashPasswordForTest('correct horse battery staple'), 'salt must be random per hash');
  assert.equal(verifyPasswordForTest('correct horse battery staple', hash), true);
  assert.equal(verifyPasswordForTest('wrong password', hash), false);
  assert.equal(verifyPasswordForTest('anything', 'not-a-valid-hash'), false);
});

test('session token extraction parses Bearer headers', async () => {
  const { getSessionToken } = await import('../src/lib/auth.ts');
  const req = (h?: string) => new Request('http://localhost/api', h ? { headers: { authorization: h } } : {});
  assert.equal(getSessionToken(req('Bearer abc123')), 'abc123');
  assert.equal(getSessionToken(req('bearer abc123')), 'abc123');
  assert.equal(getSessionToken(req('Token abc123')), null);
  assert.equal(getSessionToken(req()), null);
});
