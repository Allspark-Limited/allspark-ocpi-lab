import { NextResponse } from 'next/server';
import { rateLimit, rateLimitExceededResponse, rateLimitKey } from '@/lib/rate-limit';
import { getEnvironment, receipts } from '@/lib/repository';
import { validateSession, getSessionToken } from '@/lib/auth';

async function currentUser(request: Request) {
  const token = getSessionToken(request);
  if (!token) return null;
  return validateSession(token);
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limit = rateLimit(rateLimitKey(request));
  if (!limit.allowed) return rateLimitExceededResponse(limit);
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { slug } = await context.params;
  const environment = await getEnvironment(slug);
  if (!environment) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ environment, receipts: await receipts(environment.id) });
}
