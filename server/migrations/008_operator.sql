-- Console opérateur : opérateurs de la plateforme, état et offre de chaque entreprise, demandes d'inscription, usage figé par mois.
create table operators (
  user_id uuid primary key references users on delete cascade,
  created_at timestamptz not null default now()
);

alter table organisations
  add column status text not null default 'active' check (status in ('active', 'suspended')),
  add column suspended_at timestamptz,
  add column suspended_reason text,
  add column plan text not null default 'essai',
  add column trial_ends_on date,
  add column max_techs integer,
  add column max_elevators integer,
  add column price_monthly integer not null default 0,
  add column extra_tech_price integer not null default 0,
  add column extra_elevator_price integer not null default 0,
  add column notes text not null default '';

create table signup_requests (
  id uuid primary key,
  company text not null,
  contact_name text not null,
  email text not null,
  phone text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  decision_reason text,
  org_id uuid references organisations on delete set null
);
create index signup_requests_status on signup_requests (status, created_at);

-- Photographie mensuelle de l'usage et du montant à facturer (montants en FCFA).
create table usage_snapshots (
  org_id uuid not null references organisations on delete cascade,
  month text not null,
  plan text not null,
  techs integer not null,
  elevators integer not null,
  clients integer not null,
  jobs integer not null,
  amount integer not null,
  frozen_at timestamptz not null default now(),
  primary key (org_id, month)
);
