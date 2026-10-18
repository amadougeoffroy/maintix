-- Notifications d'astreinte : abonnements Web Push, téléphone des membres, suivi d'escalade.
alter table members add column phone text;

create table push_subscriptions (
  id uuid primary key,
  user_id uuid not null references users on delete cascade,
  org_id uuid not null references organisations on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subs_user on push_subscriptions (user_id, org_id);

-- Une alerte par mission de dépannage non prise en charge ; `level` monte quand personne n'accuse réception.
create table alerts (
  org_id uuid not null references organisations on delete cascade,
  job_id text not null,
  level integer not null default 0,
  notified_at timestamptz not null default now(),
  acked_at timestamptz,
  primary key (org_id, job_id)
);
create index alerts_open on alerts (acked_at) where acked_at is null;
