create extension if not exists pgcrypto;

create schema if not exists lab_private;
revoke all on schema lab_private from public;

create table lab_private.environments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]{12}$'),
  name text not null check (char_length(name) between 1 and 80),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  party_id text not null check (party_id ~ '^[A-Z0-9]{3}$'),
  role text not null check (role in ('CPO', 'EMSP', 'HUB', 'NAP', 'NSP', 'OTHER', 'SCSP')),
  supported_modules text[] not null default array['credentials']::text[],
  scenario text not null default 'success'
    check (scenario in ('success', 'rejected', 'timeout', 'delayed', 'malformed')),
  bootstrap_token_hash text not null check (bootstrap_token_hash ~ '^[a-f0-9]{64}$'),
  bootstrap_token_hint text not null check (char_length(bootstrap_token_hint) <= 12),
  bootstrap_consumed_at timestamptz,
  credential_generation integer not null default 0 check (credential_generation >= 0),
  status text not null default 'active' check (status in ('active', 'disconnected', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table lab_private.credentials (
  environment_id uuid primary key references lab_private.environments(id) on delete cascade,
  token_b_ciphertext text not null,
  token_b_iv text not null,
  token_b_tag text not null,
  token_c_hash text not null check (token_c_hash ~ '^[a-f0-9]{64}$'),
  token_c_ciphertext text not null,
  token_c_iv text not null,
  token_c_tag text not null,
  peer_versions_url text not null check (char_length(peer_versions_url) <= 2048),
  peer_roles jsonb not null check (jsonb_typeof(peer_roles) = 'array'),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index credentials_active_token_c_hash
  on lab_private.credentials (token_c_hash) where status = 'active';

create table lab_private.receipts (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references lab_private.environments(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  request_id text not null check (char_length(request_id) between 1 and 128),
  correlation_id text not null check (char_length(correlation_id) between 1 and 128),
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  method text,
  path text,
  outcome text not null check (char_length(outcome) between 1 and 80),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index receipts_environment_created
  on lab_private.receipts (environment_id, created_at desc);

alter table lab_private.environments enable row level security;
alter table lab_private.credentials enable row level security;
alter table lab_private.receipts enable row level security;

revoke all on all tables in schema lab_private from public;
revoke all on all sequences in schema lab_private from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema lab_private from anon;
    revoke all on all sequences in schema lab_private from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema lab_private from authenticated;
    revoke all on all sequences in schema lab_private from authenticated;
  end if;
end;
$$;

comment on schema lab_private is
  'Server-only synthetic OCPI lab state. Never expose this schema through the Supabase Data API.';
