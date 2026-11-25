alter table lab_private.credentials
  add column peer_version_url text,
  add column peer_endpoints jsonb not null default '[]'::jsonb
    check (jsonb_typeof(peer_endpoints) = 'array');
