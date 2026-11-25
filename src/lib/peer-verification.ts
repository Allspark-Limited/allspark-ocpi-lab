import { assertSafeDestination } from './deliveries.ts';

type Endpoint = { identifier: string; role: string; url: string };

function data(value: unknown): unknown {
  if (value && typeof value === 'object' && 'data' in value) return (value as { data: unknown }).data;
  return value;
}

async function fetchJson(rawUrl: string, token: string) {
  const url = await assertSafeDestination(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { redirect: 'error', signal: controller.signal,
      headers: { authorization: `Token ${token}`, 'ocpi-version': '2.2.1', accept: 'application/json' } });
    if (!response.ok) throw new Error(`peer_http_${response.status}`);
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > 524_288) throw new Error('peer_response_too_large');
    const text = await response.text();
    if (Buffer.byteLength(text) > 524_288) throw new Error('peer_response_too_large');
    return JSON.parse(text) as unknown;
  } finally { clearTimeout(timer); }
}

export async function verifyPeer(tokenB: string, versionsUrl: string) {
  const versionsBody = data(await fetchJson(versionsUrl, tokenB));
  if (!Array.isArray(versionsBody)) throw new Error('peer_versions_invalid');
  const matches = versionsBody.filter(item => item && typeof item === 'object'
    && (item as Record<string, unknown>).version === '2.2.1'
    && typeof (item as Record<string, unknown>).url === 'string');
  if (matches.length !== 1) throw new Error('peer_version_221_not_unique');
  const versionUrl = String((matches[0] as Record<string, unknown>).url);
  await assertSafeDestination(versionUrl);
  const detailBody = data(await fetchJson(versionUrl, tokenB));
  if (!detailBody || typeof detailBody !== 'object') throw new Error('peer_version_details_invalid');
  const detail = detailBody as Record<string, unknown>;
  if (detail.version !== '2.2.1' || !Array.isArray(detail.endpoints)) throw new Error('peer_version_details_invalid');
  const endpoints: Endpoint[] = [];
  for (const value of detail.endpoints) {
    if (!value || typeof value !== 'object') throw new Error('peer_endpoint_invalid');
    const item = value as Record<string, unknown>;
    if (typeof item.identifier !== 'string' || typeof item.role !== 'string' || typeof item.url !== 'string') {
      throw new Error('peer_endpoint_invalid');
    }
    await assertSafeDestination(item.url);
    endpoints.push({ identifier: item.identifier, role: item.role, url: item.url });
  }
  if (!endpoints.some(endpoint => endpoint.identifier === 'credentials' && endpoint.role === 'RECEIVER')) {
    throw new Error('peer_credentials_receiver_missing');
  }
  return { versionUrl, endpoints };
}
