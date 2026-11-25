import { config } from './config.ts';

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();

function nowMs() {
  return Date.now();
}

function prune() {
  const now = nowMs();
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(key: string): { allowed: boolean; remaining: number; resetAt: number } {
  prune();
  const limit = config().LAB_MAX_REQUESTS_PER_MINUTE;
  const window = buckets.get(key);
  const now = nowMs();
  if (!window || window.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return { allowed: true, remaining: limit - 1, resetAt: now + 60_000 };
  }
  if (window.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: window.resetAt };
  }
  window.count++;
  return { allowed: true, remaining: limit - window.count, resetAt: window.resetAt };
}

export function rateLimitKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  const url = new URL(request.url);
  return `${ip}:${url.pathname}`;
}

export function rateLimitHeaders(result: ReturnType<typeof rateLimit>) {
  return {
    'X-RateLimit-Limit': String(config().LAB_MAX_REQUESTS_PER_MINUTE),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}

export function rateLimitExceededResponse(result: ReturnType<typeof rateLimit>) {
  return new Response(JSON.stringify({ error: 'rate_limit_exceeded', retry_after: Math.ceil((result.resetAt - Date.now()) / 1000) }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(Math.ceil((result.resetAt - Date.now()) / 1000)), ...rateLimitHeaders(result) },
  });
}
