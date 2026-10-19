-- Rappels d'échéance envoyés (un par entreprise, par date d'échéance et par palier) : évite les doublons à chaque passage de la tâche horaire.
create table renewal_reminders (
  org_id uuid not null references organisations on delete cascade,
  ends_on date not null,
  kind text not null check (kind in ('d7', 'd1')),
  sent_at timestamptz not null default now(),
  primary key (org_id, ends_on, kind)
);
