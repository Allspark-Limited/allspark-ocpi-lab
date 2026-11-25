import assert from 'node:assert/strict';
import test from 'node:test';
import { envelope, parseAuthorization, sanitizeUrl, validToken, versionDetails, type EnvironmentView } from '../src/lib/ocpi.ts';

const environment: EnvironmentView = {
  id: '00000000-0000-0000-0000-000000000001', slug: 'abc123def456', name: 'Test Lab',
  countryCode: 'IE', partyId: 'LAB', role: 'EMSP',
  modules: ['credentials', 'locations', 'commands'], scenario: 'success', status: 'active',
  credentialGeneration: 0, tokenAState: 'ready', tokenAHint: 'abcd…wxyz', expiresAt: '2026-11-17T00:00:00.000Z',
};

test('advertises only enabled modules with correct roles', () => {
  const details = versionDetails(environment, 'https://lab.example/api/ocpi/abc123def456');
  assert.deepEqual(details.endpoints.map(endpoint => `${endpoint.identifier}:${endpoint.role}`), [
    'credentials:RECEIVER', 'locations:SENDER', 'commands:RECEIVER',
  ]);
});

test('accepts raw and base64 OCPI Token authorization', () => {
  assert.equal(parseAuthorization('Token token-A'), 'token-A');
  assert.equal(parseAuthorization(`Token ${Buffer.from('token-B').toString('base64')}`), 'token-B');
  assert.equal(parseAuthorization('Bearer token-C'), null);
});

test('enforces OCPI printable token bounds', () => {
  assert.equal(validToken('abc-123'), true);
  assert.equal(validToken('has a space'), false);
  assert.equal(validToken('x'.repeat(65)), false);
});

test('rejects credential-bearing and non-http URLs', () => {
  assert.equal(sanitizeUrl('https://peer.example/ocpi/versions'), 'https://peer.example/ocpi/versions');
  assert.equal(sanitizeUrl('https://user:pass@peer.example/'), null);
  assert.equal(sanitizeUrl('file:///etc/passwd'), null);
});

test('uses a spec-shaped response envelope', () => {
  const result = envelope({ ok: true });
  assert.equal(result.status_code, 1000);
  assert.equal(result.status_message, 'Success');
  assert.match(result.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});
