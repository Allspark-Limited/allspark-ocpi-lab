import { NextResponse } from 'next/server';
import { validateSession, getSessionToken } from '@/lib/auth';

export async function GET(request: Request) {
  const token = getSessionToken(request);
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const user = await validateSession(token);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ user });
}
