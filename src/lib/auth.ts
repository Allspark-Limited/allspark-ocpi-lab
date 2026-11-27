import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db.ts';

const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

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
  if (!verifyPassword(password, rows[0].password_hash)) return null;
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
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

export function getSessionToken(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match ? match[1] : null;
}

// Exported for tests only.
export const hashPasswordForTest = hashPassword;
export const verifyPasswordForTest = verifyPassword;
