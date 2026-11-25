import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

process.env.LAB_ALLOW_PRIVATE_CALLBACKS = 'true';

test('verifies symmetric OCPI 2.2.1 discovery and credentials endpoint', async () => {
  let base = '';
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/versions') return response.end(JSON.stringify({ data: [{ version: '2.2.1', url: `${base}/2.2.1` }] }));
    if (request.url === '/2.2.1') return response.end(JSON.stringify({ data: { version: '2.2.1', endpoints: [
      { identifier: 'credentials', role: 'RECEIVER', url: `${base}/2.2.1/credentials` },
      { identifier: 'locations', role: 'SENDER', url: `${base}/2.2.1/locations` },
    ] } }));
    response.statusCode = 404; response.end('{}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  base = `http://127.0.0.1:${address.port}`;
  try {
    const { verifyPeer } = await import('../src/lib/peer-verification.ts');
    const result = await verifyPeer('synthetic-token-b', `${base}/versions`);
    assert.equal(result.versionUrl, `${base}/2.2.1`);
    assert.equal(result.endpoints.length, 2);
  } finally { server.close(); }
});

test('blocks private destinations unless the local-only switch is explicit', async () => {
  const { assertSafeDestination } = await import('../src/lib/deliveries.ts');
  const previous = process.env.LAB_ALLOW_PRIVATE_CALLBACKS;
  process.env.LAB_ALLOW_PRIVATE_CALLBACKS = 'false';
  try { await assert.rejects(assertSafeDestination('http://127.0.0.1:3000/callback'), /destination_not_allowed/); }
  finally { process.env.LAB_ALLOW_PRIVATE_CALLBACKS = previous; }
});
