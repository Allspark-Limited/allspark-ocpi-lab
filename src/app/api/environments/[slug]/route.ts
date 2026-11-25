import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getEnvironment, receipts } from '@/lib/repository';

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (request.headers.get('x-lab-admin-secret') !== config().LAB_ADMIN_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { slug } = await context.params;
  const environment = await getEnvironment(slug);
  if (!environment) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ environment, receipts: await receipts(environment.id) });
}
