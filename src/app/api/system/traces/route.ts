import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { rateLimit, rateLimitExceededResponse, rateLimitKey } from '@/lib/rate-limit';
import { getEnvironment, traceDetail, tracesList } from '@/lib/repository';

function authorized(request: Request) {
  return request.headers.get('x-lab-admin-secret') === config().LAB_ADMIN_SECRET;
}

export async function GET(request: Request) {
  const limit = rateLimit(rateLimitKey(request));
  if (!limit.allowed) return rateLimitExceededResponse(limit);
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug_required' }, { status: 400 });
  const environment = await getEnvironment(slug);
  if (!environment) return NextResponse.json({ error: 'environment_not_found' }, { status: 404 });
  const traces = await tracesList(environment.id);
  return NextResponse.json({ traces });
}

export async function GET_TRACE(request: Request, context: { params: Promise<{ traceId: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  const { traceId } = await context.params;
  if (!slug || !traceId) return NextResponse.json({ error: 'slug_and_trace_id_required' }, { status: 400 });
  const environment = await getEnvironment(slug);
  if (!environment) return NextResponse.json({ error: 'environment_not_found' }, { status: 404 });
  const trace = await traceDetail(environment.id, traceId);
  if (!trace) return NextResponse.json({ error: 'trace_not_found' }, { status: 404 });
  return NextResponse.json({ trace });
}
