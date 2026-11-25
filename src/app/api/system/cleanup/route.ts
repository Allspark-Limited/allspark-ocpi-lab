import { NextResponse } from 'next/server';
import { cleanupExpired } from '@/lib/repository';
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected && request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ expired: await cleanupExpired() });
}
