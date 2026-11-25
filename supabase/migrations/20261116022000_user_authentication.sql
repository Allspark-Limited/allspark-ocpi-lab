create table lab_private.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) between 3 and 254),
  password_hash text not null check (char_length(password_hash) = 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lab_private.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references lab_private.users(id) on delete cascade,
  session_token_hash text not null check (char_length(session_token_hash) = 64),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index user_sessions_user_id on lab_private.user_sessions (user_id);
create index user_sessions_token_hash on lab_private.user_sessions (session_token_hash);

alter table lab_private.environments
  add column owner_id uuid references lab_private.users(id) on delete set null;

alter table lab_private.environments enable row level security;
alter table lab_private.users enable row level security;
alter table lab_private.user_sessions enable row level security;

revoke all on lab_private.users, lab_private.user_sessions from public;
revoke all on lab_private.users, lab_private.user_sessions from anon;
revoke all on lab_private.users, lab_private.user_sessions from authenticated;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'lab_private' and tablename = 'environments' and policyname = 'owner_access') then
    -- policy will be created below
  end if;
end $$;

create policy owner_environment_access on lab_private.environments
  for all to authenticated
  using (auth.uid()::text = owner_id::text)
  with check (auth.uid()::text = owner_id::text);

create policy user_own_access on lab_private.users
  for all to authenticated
  using (auth.uid()::text = id::text)
  with check (auth.uid()::text = id::text);

create policy session_own_access on lab_private.user_sessions
  for all to authenticated
  using (auth.uid()::text = user_id::text)
  with check (auth.uid()::text = user_id::text);

comment on table lab_private.users is 'Lab user accounts for tenant ownership and authentication.';
comment on table lab_private.user_sessions is 'User sessions for authenticated lab access.';
comment on column lab_private.environments.owner_id is 'User who owns this environment (tenant).';
