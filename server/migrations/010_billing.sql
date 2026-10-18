-- Suspensions motivées (catalogue), échéance d'abonnement, paiements (Jèko ou enregistrés par un opérateur), réglages de plateforme.
create table suspension_reasons (
  code text primary key,
  label text not null,
  /** un paiement de l'entreprise peut lever cette suspension (sinon seul un opérateur le peut) */
  lifted_by_payment boolean not null default false,
  automatic boolean not null default false,
  sort integer not null default 100
);
insert into suspension_reasons (code, label, lifted_by_payment, automatic, sort) values
  ('unpaid', 'Facture impayée', true, false, 10),
  ('trial_expired', 'Fin de la période d’essai', true, true, 20),
  ('subscription_expired', 'Échéance de l’offre souscrite atteinte', true, true, 30),
  ('terms_breach', 'Non-respect des conditions d’utilisation', false, false, 40),
  ('security', 'Raison de sécurité', false, false, 50),
  ('other', 'Autre motif', false, false, 90);

alter table organisations
  add column suspended_reason_code text references suspension_reasons (code),
  add column subscription_ends_on date;
update organisations set suspended_reason_code = 'other' where status = 'suspended';

create table payments (
  id uuid primary key,
  org_id uuid not null references organisations on delete cascade,
  plan text not null,
  months integer not null check (months in (1, 3, 6, 12)),
  amount integer not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  source text not null default 'jeko' check (source in ('jeko', 'manual')),
  method text,
  reference text not null unique,
  provider_id text,
  redirect_url text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  period_start date,
  period_end date
);
create index payments_org on payments (org_id, created_at desc);
create index payments_status on payments (status, created_at);

create table platform_settings (
  key text primary key,
  value text not null,
  secret boolean not null default false,
  updated_at timestamptz not null default now()
);
