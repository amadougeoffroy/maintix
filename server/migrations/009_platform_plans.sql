-- Entreprise « plateforme » (où vivent les opérateurs) distincte des entreprises clientes ; catalogue d'offres géré en console.
alter table organisations add column kind text not null default 'client' check (kind in ('client', 'platform'));
update organisations set kind = 'platform' where plan = 'interne';

create table plans (
  code text primary key,
  name text not null,
  max_techs integer,
  max_elevators integer,
  price_monthly integer not null default 0,
  extra_tech_price integer not null default 0,
  extra_elevator_price integer not null default 0,
  trial_days integer,
  archived boolean not null default false,
  sort integer not null default 100,
  created_at timestamptz not null default now()
);
insert into plans (code, name, max_techs, max_elevators, price_monthly, extra_tech_price, extra_elevator_price, trial_days, sort) values
  ('essai', 'Essai gratuit', 3, 25, 0, 0, 0, 30, 10),
  ('essentiel', 'Essentiel', 5, 100, 35000, 5000, 150, null, 20),
  ('pro', 'Pro', 15, 500, 90000, 4000, 100, null, 30),
  ('sur-mesure', 'Sur mesure', null, null, 0, 0, 0, null, 40),
  ('interne', 'Interne (non facturé)', null, null, 0, 0, 0, null, 50);
