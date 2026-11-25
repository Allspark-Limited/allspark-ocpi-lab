import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from './db.ts';

type UserRow = {
  id: string; email: string; password_hash: string; created_at: string; updated_at: string;
};

type SessionRow = {
  id: string; user_id: string; session_token_hash: string; expires_at: string; created_at: string;
};

export async function createUser(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = hashPassword(input.password);
  const sql = db();
  const rows = (await sql<UserRow[]>`
    insert into lab_private.users (email, password_hash)
    values (${email}, ${passwordHash})
    returning *`) as unknown as UserRow[];
  return { id: rows[0].id, email: rows[0].email };
}

export async function verifyUser(email: string, password: string): Promise<{ id: string; email: string } | null> {
  const sql = db();
  const rows = (await sql<UserRow[]>`
    select * from lab_private.users where email = ${email.trim().toLowerCase()}`) as unknown as UserRow[];
  if (!rows[0]) return null;
  const ok = timingSafeEqual(
    Buffer.from(hashPassword(password), 'hex'),
    Buffer.from(rows[0].password_hash, 'hex'),
  );
  if (!ok) return null;
  return { id: rows[0].id, email: rows[0].email };
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const sql = db();
  await sql<SessionRow[]>`
    insert into lab_private.user_sessions (user_id, session_token_hash, expires_at)
    values (${userId}, ${tokenHash}, ${expiresAt})`;
  return token;
}

export async function validateSession(sessionToken: string): Promise<{ id: string; email: string } | null> {
  const tokenHash = createHash('sha256').update(sessionToken, 'utf8').digest('hex');
  const sql = db();
  const rows = (await sql<SessionRow[]>`
    select * from lab_private.user_sessions
    where session_token_hash = ${tokenHash} and expires_at > now()`) as unknown as SessionRow[];
  if (!rows[0]) return null;
  const userRows = (await sql<UserRow[]>`
    select * from lab_private.users where id = ${rows[0].user_id}`) as unknown as UserRow[];
  if (!userRows[0]) return null;
  return { id: userRows[0].id, email: userRows[0].email };
}

export async function destroySession(sessionToken: string) {
  const tokenHash = createHash('sha256').update(sessionToken, 'utf8').digest('hex');
  const sql = db();
  await sql`delete from lab_private.user_sessions where session_token_hash = ${tokenHash}`;
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex');
}

export function getSessionToken(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match ? match[1] : null;
}
