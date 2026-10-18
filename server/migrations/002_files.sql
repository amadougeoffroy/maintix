-- Stockage des photos et signatures, adressées par leur empreinte SHA-256 (contenu inaltérable).
create table files (
  org_id uuid not null references organisations on delete cascade,
  hash text not null,
  mime text not null,
  size integer not null,
  data bytea not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (org_id, hash)
);
