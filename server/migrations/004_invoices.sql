-- Compteur de numéros de facture par organisation et par année : séquence continue, attribuée à l'émission.
create table invoice_counters (
  org_id uuid not null references organisations on delete cascade,
  year integer not null,
  last integer not null default 0,
  primary key (org_id, year)
);
