import { NextResponse } from 'next/server';
import { getSessionToken, destroySession } from '@/lib/auth';

export async function POST(request: Request) {
  const token = getSessionToken(request);
  if (token) await destroySession(token);
  return NextResponse.json({ ok: true });
}
