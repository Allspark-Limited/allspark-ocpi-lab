import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET() {
  try { await db()`select 1`; return NextResponse.json({ status: 'ready' }); }
  catch { return NextResponse.json({ status: 'unavailable' }, { status: 503 }); }
}
