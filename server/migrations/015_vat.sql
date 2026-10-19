-- TVA optionnelle sur les abonnements : taux et montant figés sur chaque paiement.
alter table payments
  add column vat_rate numeric(5, 2) not null default 0,
  add column vat_amount integer not null default 0;
