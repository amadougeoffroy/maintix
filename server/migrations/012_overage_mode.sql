-- Dépassement des plafonds : facturé (l'ajout reste possible) ou bloquant (l'ajout est refusé), réglé par offre puis copié sur l'entreprise.
alter table plans add column overage_mode text not null default 'bill' check (overage_mode in ('bill', 'block'));
alter table organisations add column overage_mode text not null default 'bill' check (overage_mode in ('bill', 'block'));
update plans set overage_mode = 'block' where code = 'essai';
update organisations o set overage_mode = p.overage_mode from plans p where p.code = o.plan;
