import { NextResponse } from 'next/server';
import { z } from 'zod';
import { config } from '@/lib/config';
import { createEnvironment, listEnvironments } from '@/lib/repository';

const inputSchema = z.object({
  name: z.string().trim().min(1).max(80).default('Synthetic OCPI lab'),
  countryCode: z.string().regex(/^[A-Z]{2}$/).default('IE'),
  partyId: z.string().regex(/^[A-Z0-9]{3}$/).default('LAB'),
  role: z.enum(['CPO', 'EMSP', 'HUB', 'NAP', 'NSP', 'OTHER', 'SCSP']).default('EMSP'),
  modules: z.array(z.enum(['credentials', 'locations', 'tariffs', 'tokens', 'commands', 'sessions', 'cdrs']))
    .min(1).default(['credentials', 'locations', 'tariffs', 'tokens', 'commands', 'sessions', 'cdrs']),
  scenario: z.enum(['success', 'rejected', 'timeout', 'delayed', 'malformed']).default('success'),
});

function authorized(request: Request) {
  return request.headers.get('x-lab-admin-secret') === config().LAB_ADMIN_SECRET;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ environments: await listEnvironments() });
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_environment', issues: parsed.error.issues }, { status: 400 });
  try {
    const created = await createEnvironment(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'create_failed';
    return NextResponse.json({ error: message }, { status: message === 'environment_capacity_reached' ? 429 : 500 });
  }
}
