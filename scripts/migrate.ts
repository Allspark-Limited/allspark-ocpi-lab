import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error('DATABASE_URL is required');
const sql = postgres(connection, { max: 1, prepare: false });

try {
  await sql`create schema if not exists lab_migrations`;
  await sql`create table if not exists lab_migrations.applied (name text primary key, applied_at timestamptz not null default now())`;
  // Ensure Supabase-compatible roles exist for GRANT/REVOKE statements
  await sql`do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon noinherit noLogin; end if; end $$;`;
  await sql`do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated noinherit noLogin; end if; end $$;`;
  // Create auth schema and auth.uid() function for Supabase-like policies
  await sql`create schema if not exists auth;`;
  await sql`create or replace function auth.uid() returns uuid language sql as $$ select null::uuid $$;`;
  const directory = path.join(process.cwd(), 'supabase', 'migrations');
  const files = (await readdir(directory)).filter(file => file.endsWith('.sql')).sort();
  for (const file of files) {
    const existing = await sql`select 1 from lab_migrations.applied where name = ${file}`;
    if (existing[0]) continue;
    const source = await readFile(path.join(directory, file), 'utf8');
    await sql.begin(async transaction => {
      await transaction.unsafe(source);
      await transaction`insert into lab_migrations.applied (name) values (${file})`;
    });
    console.log(`Applied ${file}`);
  }
} finally {
  await sql.end();
}
