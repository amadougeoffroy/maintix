-- Schéma initial. Les données métier sont synchronisées sous forme de documents (voir docs/BACKEND.md).
create table organisations (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table members (
  user_id uuid not null references users on delete cascade,
  org_id uuid not null references organisations on delete cascade,
  role text not null check (role in ('admin', 'bureau', 'tech', 'client')),
  full_name text not null,
  tech_id text,
  client_id text,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

create table login_tokens (
  token_hash text primary key,
  user_id uuid not null references users on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users on delete cascade,
  org_id uuid not null references organisations on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user on sessions (user_id);

create sequence docs_seq;
create table docs (
  org_id uuid not null references organisations on delete cascade,
  collection text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  seq bigint not null default nextval('docs_seq'),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (org_id, collection, id)
);
create index docs_org_seq on docs (org_id, seq);
create index docs_lookup on docs (collection, id);

create table audit_log (
  id bigserial primary key,
  org_id uuid not null,
  user_id uuid,
  at timestamptz not null default now(),
  action text not null,
  collection text,
  doc_id text,
  detail jsonb
);
create index audit_org_at on audit_log (org_id, at desc);
