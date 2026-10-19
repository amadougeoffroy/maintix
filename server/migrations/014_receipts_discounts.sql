-- Remises de durée et reçus numérotés des paiements d'abonnement.
alter table payments
  add column list_amount integer,
  add column discount_pct integer not null default 0,
  add column receipt_number text unique;
update payments set list_amount = amount where list_amount is null;

create table receipt_counters (
  year integer primary key,
  last integer not null default 0
);
