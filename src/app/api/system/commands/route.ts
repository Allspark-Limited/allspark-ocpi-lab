import { NextResponse } from 'next/server';
import { rateLimit, rateLimitExceededResponse, rateLimitKey } from '@/lib/rate-limit';
import { assertSafeDestination } from '@/lib/deliveries';
import { sendCommand } from '@/lib/repository';
import { trace } from '@/lib/repository';
import { validateSession, getSessionToken } from '@/lib/auth';

async function currentUser(request: Request) {
  const token = getSessionToken(request);
  if (!token) return null;
  return validateSession(token);
}

export async function POST(request: Request) {
  const limit = rateLimit(rateLimitKey(request));
  if (!limit.allowed) return rateLimitExceededResponse(limit);
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const slug = typeof body?.slug === 'string' ? body.slug : undefined;
  const command = body?.command === 'START_SESSION' || body?.command === 'STOP_SESSION' ? body.command : undefined;
  const peerUrl = typeof body?.peer_url === 'string' ? body.peer_url : undefined;
  const responseUrl = typeof body?.response_url === 'string' ? body.response_url : undefined;
  const authorizationReference = typeof body?.authorization_reference === 'string' ? body.authorization_reference : undefined;
  const requestedSessionId = typeof body?.session_id === 'string' ? body.session_id : undefined;
  if (!slug || !command || !peerUrl || !responseUrl) {
    return NextResponse.json({ error: 'invalid_command_request' }, { status: 400 });
  }
  try {
    await assertSafeDestination(responseUrl);
  } catch {
    return NextResponse.json({ error: 'callback_destination_not_allowed' }, { status: 400 });
  }
  const { environment, traceIds } = await (async () => {
    const { getEnvironment } = await import('@/lib/repository');
    const environment = await getEnvironment(slug);
    if (!environment) throw new Error('environment_not_found');
    return { environment, traceIds: trace(request) };
  })();
  try {
    const result = await sendCommand({
      environment, command, peerUrl, responseUrl,
      authorizationReference, requestedSessionId,
      requestId: traceIds.requestId, correlationId: traceIds.correlationId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'command_send_failed';
    return NextResponse.json({ error: message }, { status: message === 'no_active_token_c' ? 409 : 500 });
  }
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug_required' }, { status: 400 });
  const { getEnvironment, commandsList } = await import('@/lib/repository');
  const environment = await getEnvironment(slug);
  if (!environment) return NextResponse.json({ error: 'environment_not_found' }, { status: 404 });
  const commands = await commandsList(environment.id);
  return NextResponse.json({ commands });
}

export async function DELETE(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  const commandId = url.searchParams.get('command_id');
  if (!slug || !commandId) return NextResponse.json({ error: 'slug_and_command_id_required' }, { status: 400 });
  const { getEnvironment } = await import('@/lib/repository');
  const environment = await getEnvironment(slug);
  if (!environment) return NextResponse.json({ error: 'environment_not_found' }, { status: 404 });
  const { commandStatus } = await import('@/lib/repository');
  const command = await commandStatus(environment.id, commandId);
  if (!command) return NextResponse.json({ error: 'command_not_found' }, { status: 404 });
  return NextResponse.json({ command });
}
