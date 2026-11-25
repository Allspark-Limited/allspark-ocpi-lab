export const OCPI_VERSION = '2.2.1';
export const OCPI_SUCCESS = 1000;

export type OcpiRole = 'CPO' | 'EMSP' | 'HUB' | 'NAP' | 'NSP' | 'OTHER' | 'SCSP';
export type Scenario = 'success' | 'rejected' | 'timeout' | 'delayed' | 'malformed';

export type EnvironmentView = {
  id: string;
  slug: string;
  name: string;
  countryCode: string;
  partyId: string;
  role: OcpiRole;
  modules: string[];
  scenario: Scenario;
  status: 'active' | 'disconnected' | 'expired';
  credentialGeneration: number;
  tokenAState: 'ready' | 'consumed';
  tokenAHint: string;
  expiresAt: string;
};

export function envelope(data: unknown, statusCode = OCPI_SUCCESS, statusMessage = 'Success') {
  return { data, status_code: statusCode, status_message: statusMessage, timestamp: new Date().toISOString() };
}

export type ModuleDirection = 'SENDER' | 'RECEIVER';

const senderModulesByRole: Record<OcpiRole, string[]> = {
  CPO: ['locations', 'tariffs', 'tokens'],
  EMSP: ['sessions', 'cdrs', 'commands'],
  HUB: ['locations', 'tariffs', 'tokens', 'sessions', 'cdrs', 'commands'],
  NAP: ['locations', 'tariffs', 'tokens', 'sessions', 'cdrs', 'commands'],
  NSP: ['sessions', 'cdrs', 'commands'],
  SCSP: ['sessions', 'cdrs', 'commands'],
  OTHER: [],
};

export function moduleDirection(role: OcpiRole, module: string): ModuleDirection {
  if (module === 'credentials') return 'RECEIVER';
  return senderModulesByRole[role].includes(module) ? 'SENDER' : 'RECEIVER';
}

export function versionDetails(environment: EnvironmentView, baseUrl: string) {
  const endpoints = [{ identifier: 'credentials', role: 'RECEIVER', url: `${baseUrl}/2.2.1/credentials` }];
  for (const identifier of environment.modules) {
    if (identifier === 'credentials') continue;
    endpoints.push({
      identifier,
      role: moduleDirection(environment.role, identifier),
      url: `${baseUrl}/2.2.1/${identifier}`,
    });
  }
  return { version: OCPI_VERSION, endpoints };
}

export function parseAuthorization(header: string | null): string | null {
  if (!header) return null;
  const match = /^Token\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const raw = match[1];
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    if (decoded && Buffer.from(decoded).toString('base64').replace(/=+$/, '') === raw.replace(/=+$/, '')) return decoded;
  } catch {}
  return raw;
}

export function validToken(value: unknown): value is string {
  return typeof value === 'string' && /^[\x21-\x7E]{1,64}$/.test(value);
}

export function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const localCallback = process.env.LAB_ALLOW_PRIVATE_CALLBACKS === 'true'
      && ['localhost', '127.0.0.1', 'host.docker.internal'].includes(url.hostname);
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:' && !localCallback) return null;
    return url.toString();
  } catch {
    return null;
  }
}
