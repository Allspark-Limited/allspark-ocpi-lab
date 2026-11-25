create table lab_private.commands (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references lab_private.environments(id) on delete cascade,
  command text not null check (command in ('START_SESSION', 'STOP_SESSION')),
  response_url text not null check (char_length(response_url) <= 2048),
  authorization_reference text,
  session_id text,
  immediate_result text not null check (immediate_result in ('ACCEPTED', 'REJECTED', 'TIMEOUT')),
  callback_result text check (callback_result in ('ACCEPTED', 'REJECTED', 'TIMEOUT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lab_private.synthetic_objects (
  environment_id uuid not null references lab_private.environments(id) on delete cascade,
  module text not null check (module in ('sessions', 'cdrs')),
  object_id text not null check (char_length(object_id) between 1 and 128),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (environment_id, module, object_id)
);

create table lab_private.deliveries (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references lab_private.environments(id) on delete cascade,
  command_id uuid not null references lab_private.commands(id) on delete cascade,
  destination_url text not null check (char_length(destination_url) <= 2048),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  available_at timestamptz not null default now(),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deliveries_due on lab_private.deliveries (available_at, created_at)
  where status = 'pending';

alter table lab_private.commands enable row level security;
alter table lab_private.synthetic_objects enable row level security;
alter table lab_private.deliveries enable row level security;
revoke all on lab_private.commands, lab_private.synthetic_objects, lab_private.deliveries from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on lab_private.commands, lab_private.synthetic_objects, lab_private.deliveries from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on lab_private.commands, lab_private.synthetic_objects, lab_private.deliveries from authenticated;
  end if;
end;
$$;
