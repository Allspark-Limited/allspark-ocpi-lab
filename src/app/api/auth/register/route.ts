import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit, rateLimitExceededResponse, rateLimitKey } from '@/lib/rate-limit';
import { createUser } from '@/lib/auth';

const inputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const limit = rateLimit(rateLimitKey(request));
  if (!limit.allowed) return rateLimitExceededResponse(limit);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', issues: parsed.error.issues }, { status: 400 });
  try {
    const user = await createUser(parsed.data);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'register_failed';
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
