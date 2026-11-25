import { NextResponse } from 'next/server';
import { rateLimit, rateLimitExceededResponse, rateLimitKey } from '@/lib/rate-limit';
import { getSessionToken, destroySession } from '@/lib/auth';

export async function POST(request: Request) {
  const limit = rateLimit(rateLimitKey(request));
  if (!limit.allowed) return rateLimitExceededResponse(limit);
  const token = getSessionToken(request);
  if (token) await destroySession(token);
  return NextResponse.json({ ok: true });
}
