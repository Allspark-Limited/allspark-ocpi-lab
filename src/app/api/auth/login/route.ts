import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit, rateLimitExceededResponse, rateLimitKey } from '@/lib/rate-limit';
import { verifyUser, createSession } from '@/lib/auth';

const inputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const limit = rateLimit(rateLimitKey(request));
  if (!limit.allowed) return rateLimitExceededResponse(limit);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', issues: parsed.error.issues }, { status: 400 });
  const user = await verifyUser(parsed.data.email, parsed.data.password);
  if (!user) return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  const token = await createSession(user.id);
  return NextResponse.json({ user, sessionToken: token });
}
