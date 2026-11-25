import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createEnvironment, listEnvironments } from '@/lib/repository';
import { validateSession, getSessionToken } from '@/lib/auth';

const inputSchema = z.object({
  name: z.string().trim().min(1).max(80).default('Synthetic OCPI lab'),
  countryCode: z.string().regex(/^[A-Z]{2}$/).default('IE'),
  partyId: z.string().regex(/^[A-Z0-9]{3}$/).default('LAB'),
  role: z.enum(['CPO', 'EMSP', 'HUB', 'NAP', 'NSP', 'OTHER', 'SCSP']).default('EMSP'),
  modules: z.array(z.enum(['credentials', 'locations', 'tariffs', 'tokens', 'commands', 'sessions', 'cdrs']))
    .min(1).default(['credentials', 'locations', 'tariffs', 'tokens', 'commands', 'sessions', 'cdrs']),
  scenario: z.enum(['success', 'rejected', 'timeout', 'delayed', 'malformed']).default('success'),
});

async function currentUser(request: Request) {
  const token = getSessionToken(request);
  if (!token) return null;
  return validateSession(token);
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ environments: await listEnvironments() });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_environment', issues: parsed.error.issues }, { status: 400 });
  try {
    const created = await createEnvironment({ ...parsed.data, ownerId: user.id });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'create_failed';
    return NextResponse.json({ error: message }, { status: message === 'environment_capacity_reached' ? 429 : 500 });
  }
}
