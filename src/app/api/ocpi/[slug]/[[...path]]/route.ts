import { NextResponse } from 'next/server';
import { publicOrigin } from '@/lib/config';
import { fixtures } from '@/lib/fixtures';
import { assertSafeDestination } from '@/lib/deliveries';
import { verifyPeer } from '@/lib/peer-verification';
import { envelope, moduleDirection, parseAuthorization, sanitizeUrl, validToken, versionDetails } from '@/lib/ocpi';
import {
  authenticate, createSyntheticCommand, currentCredential, disconnect, getEnvironment, moduleObjects,
  registerCredentials, trace, upsertModuleObject, deleteModuleObject,
} from '@/lib/repository';

type Context = { params: Promise<{ slug: string; path?: string[] }> };

function reply(data: unknown, traceIds: { requestId: string; correlationId: string }, status = 200) {
  const response = NextResponse.json(data, { status });
  response.headers.set('X-Request-ID', traceIds.requestId);
  response.headers.set('X-Correlation-ID', traceIds.correlationId);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

async function contextFor(request: Request, context: Context) {
  const params = await context.params;
  const environment = await getEnvironment(params.slug);
  const traceIds = trace(request);
  const path = `/${(params.path ?? []).join('/')}`;
  const base = `${publicOrigin(request.url)}/api/ocpi/${params.slug}`;
  return { environment, traceIds, path, base };
}

const moduleSegment = /^\/2\.2\.1\/(locations|tariffs|tokens|sessions|cdrs)\/(.+)$/;

function moduleObjectKey(path: string): { module: string; objectId: string } | null {
  const match = moduleSegment.exec(path);
  if (!match) return null;
  return { module: match[1], objectId: match[2] };
}

export async function GET(request: Request, routeContext: Context) {
  const { environment, traceIds, path, base } = await contextFor(request, routeContext);
  if (!environment || environment.status === 'expired') return reply(envelope(null, 2001, 'Environment unavailable'), traceIds, 404);
  if (path === '/versions') return reply(envelope([{ version: '2.2.1', url: `${base}/2.2.1` }]), traceIds);

  const auth = await authenticate(environment, parseAuthorization(request.headers.get('authorization')));
  if (auth.kind === 'invalid') return reply(envelope(null, 2002, 'Invalid or missing token'), traceIds, 401);
  if (path === '/2.2.1') return reply(envelope(versionDetails(environment, base)), traceIds);
  if (path === '/2.2.1/credentials') {
    const token = await currentCredential(environment);
    if (!token) return reply(envelope(null, 2003, 'No active credentials'), traceIds, 404);
    return reply(envelope({ token, url: `${base}/versions`, roles: [{ role: environment.role, party_id: environment.partyId,
      country_code: environment.countryCode, business_details: { name: environment.name } }] }), traceIds);
  }
  const moduleName = /^\/2\.2\.1\/(locations|tariffs|tokens|sessions|cdrs)$/.exec(path)?.[1] as keyof ReturnType<typeof fixtures> | undefined;
  if (moduleName && environment.modules.includes(moduleName)) {
    if (moduleDirection(environment.role, moduleName) !== 'SENDER') {
      return reply(envelope(null, 2002, 'Module not published by this role'), traceIds, 403);
    }
    const data = moduleName === 'sessions' || moduleName === 'cdrs'
      ? await moduleObjects(environment.id, moduleName)
      : fixtures(environment)[moduleName];
    return reply(envelope(data), traceIds);
  }
  const key = moduleObjectKey(path);
  if (key && environment.modules.includes(key.module)) {
    if (moduleDirection(environment.role, key.module) !== 'SENDER') {
      return reply(envelope(null, 2002, 'Module not published by this role'), traceIds, 403);
    }
    const objects = await moduleObjects(environment.id, key.module as 'sessions' | 'cdrs');
    const found = objects.find(obj => obj.id === key.objectId);
    if (found) return reply(envelope(found), traceIds);
    return reply(envelope(null, 2003, 'Object not found'), traceIds, 404);
  }
  return reply(envelope(null, 2003, 'Endpoint not found'), traceIds, 404);
}

async function writeCredentials(request: Request, routeContext: Context, method: 'POST' | 'PUT') {
  const { environment, traceIds, path, base } = await contextFor(request, routeContext);
  if (!environment || path !== '/2.2.1/credentials') return reply(envelope(null, 2003, 'Endpoint not found'), traceIds, 404);
  const auth = await authenticate(environment, parseAuthorization(request.headers.get('authorization')));
  if ((method === 'POST' && auth.kind !== 'A') || (method === 'PUT' && auth.kind !== 'C')) {
    return reply(envelope(null, 2002, 'Invalid credential lifecycle token'), traceIds, 401);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const tokenB = body?.token;
  const peerUrl = sanitizeUrl(body?.url);
  const roles = body?.roles;
  if (!validToken(tokenB) || !peerUrl || !Array.isArray(roles) || roles.length === 0) {
    return reply(envelope(null, 2001, 'Invalid credentials payload'), traceIds, 400);
  }
  if (environment.scenario === 'rejected') return reply(envelope(null, 3001, 'Synthetic rejection'), traceIds, 409);
  if (environment.scenario === 'timeout') return reply(envelope(null, 3000, 'Synthetic timeout'), traceIds, 504);
  if (environment.scenario === 'malformed') return reply({ synthetic_malformed_response: true }, traceIds);
  if (environment.scenario === 'delayed') await new Promise(resolve => setTimeout(resolve, 1200));
  let verifiedPeer;
  try { verifiedPeer = await verifyPeer(tokenB, peerUrl); }
  catch (error) {
    const message = error instanceof Error ? error.message : 'peer_verification_failed';
    return reply(envelope(null, 2001, message), traceIds, 400);
  }
  const tokenC = await registerCredentials({ environment, tokenB, peerUrl, roles, method, verifiedPeer, ...traceIds });
  if (!tokenC) return reply(envelope(null, 2002, 'Credential generation already consumed'), traceIds, 409);
  return reply(envelope({ token: tokenC, url: `${base}/versions`, roles: [{ role: environment.role,
    party_id: environment.partyId, country_code: environment.countryCode,
    business_details: { name: environment.name } }] }), traceIds);
}

async function command(request: Request, routeContext: Context) {
  const { environment, traceIds, path } = await contextFor(request, routeContext);
  const commandName = /^\/2\.2\.1\/commands\/(START_SESSION|STOP_SESSION)$/.exec(path)?.[1] as 'START_SESSION' | 'STOP_SESSION' | undefined;
  if (!environment || !commandName || !environment.modules.includes('commands')) {
    return reply(envelope(null, 2003, 'Endpoint not found'), traceIds, 404);
  }
  if (moduleDirection(environment.role, 'commands') !== 'SENDER') {
    return reply(envelope(null, 2002, 'Role not authorized to send commands'), traceIds, 403);
  }
  const auth = await authenticate(environment, parseAuthorization(request.headers.get('authorization')));
  if (auth.kind !== 'C') return reply(envelope(null, 2002, 'Invalid Token C'), traceIds, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const responseUrl = sanitizeUrl(body?.response_url);
  if (!responseUrl) return reply(envelope(null, 2001, 'Invalid response_url'), traceIds, 400);
  try { await assertSafeDestination(responseUrl); }
  catch { return reply(envelope(null, 2001, 'Outbound callback destination is not allowed'), traceIds, 400); }
  if (commandName === 'START_SESSION' && (body?.location_id !== 'LAB-LOCATION-1' || body?.evse_uid !== 'LAB-EVSE-1')) {
    return reply(envelope({ result: 'REJECTED', timeout: 30, message: 'Synthetic target not found' }), traceIds);
  }
  if (commandName === 'STOP_SESSION' && typeof body?.session_id !== 'string') {
    return reply(envelope(null, 2001, 'session_id is required'), traceIds, 400);
  }
  try {
    const result = await createSyntheticCommand({ environment, command: commandName, responseUrl,
      authorizationReference: typeof body?.authorization_reference === 'string' ? body.authorization_reference : undefined,
      requestedSessionId: typeof body?.session_id === 'string' ? body.session_id : undefined, ...traceIds });
    if (environment.scenario === 'malformed') return reply({ synthetic_malformed_response: true }, traceIds);
    return reply(envelope({ result: result.result, timeout: 30,
      message: `Synthetic ${commandName} ${result.result.toLowerCase()}` }), traceIds);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'command_failed';
    return reply(envelope({ result: 'REJECTED', timeout: 30, message }), traceIds, 409);
  }
}

export async function POST(request: Request, context: Context) {
  const params = await context.params;
  const path = `/${(params.path ?? []).join('/')}`;
  if (path === '/2.2.1/credentials') return writeCredentials(request, { params: Promise.resolve(params) }, 'POST');
  return command(request, { params: Promise.resolve(params) });
}
export async function PUT(request: Request, context: Context) {
  const params = await context.params;
  const path = `/${(params.path ?? []).join('/')}`;
  if (path === '/2.2.1/credentials') return writeCredentials(request, { params: Promise.resolve(params) }, 'PUT');
  return upsertModule(request, { params: Promise.resolve(params) });
}
export async function PATCH(request: Request, routeContext: Context) {
  return upsertModule(request, routeContext);
}
export async function DELETE(request: Request, routeContext: Context) {
  const { environment, traceIds, path } = await contextFor(request, routeContext);
  if (!environment) return reply(envelope(null, 2001, 'Environment unavailable'), traceIds, 404);
  const auth = await authenticate(environment, parseAuthorization(request.headers.get('authorization')));
  if (auth.kind !== 'C') return reply(envelope(null, 2002, 'Invalid Token C'), traceIds, 401);
  if (path === '/2.2.1/credentials') {
    await disconnect(environment, traceIds.requestId, traceIds.correlationId);
    return reply(envelope(null), traceIds);
  }
  const key = moduleObjectKey(path);
  if (!key || !environment.modules.includes(key.module)) {
    return reply(envelope(null, 2003, 'Endpoint not found'), traceIds, 404);
  }
  if (moduleDirection(environment.role, key.module) !== 'SENDER') {
    return reply(envelope(null, 2002, 'Role not authorized to publish this module'), traceIds, 403);
  }
  await deleteModuleObject(environment.id, key.module as 'sessions' | 'cdrs', key.objectId);
  return reply(envelope(null), traceIds);
}

async function upsertModule(request: Request, routeContext: Context) {
  const { environment, traceIds, path } = await contextFor(request, routeContext);
  if (!environment) return reply(envelope(null, 2001, 'Environment unavailable'), traceIds, 404);
  const auth = await authenticate(environment, parseAuthorization(request.headers.get('authorization')));
  if (auth.kind !== 'C') return reply(envelope(null, 2002, 'Invalid Token C'), traceIds, 401);
  if (path === '/2.2.1/credentials') {
    const params = await (routeContext as Context).params;
    return writeCredentials(request, { params: Promise.resolve(params) }, 'PUT');
  }
  const key = moduleObjectKey(path);
  if (!key || !environment.modules.includes(key.module)) {
    return reply(envelope(null, 2003, 'Endpoint not found'), traceIds, 404);
  }
  if (moduleDirection(environment.role, key.module) !== 'SENDER') {
    return reply(envelope(null, 2002, 'Role not authorized to publish this module'), traceIds, 403);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return reply(envelope(null, 2001, 'Invalid payload'), traceIds, 400);
  }
  await upsertModuleObject(environment.id, key.module as 'sessions' | 'cdrs', key.objectId, body);
  return reply(envelope({ id: key.objectId }), traceIds);
}
