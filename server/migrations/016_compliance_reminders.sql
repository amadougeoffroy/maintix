-- Rappels d'échéances réglementaires déjà envoyés (un par échéance et par palier : 30 jours, 7 jours, dépassée).
create table compliance_reminders (
  org_id uuid not null references organisations on delete cascade,
  elevator_id text not null,
  item_id text not null,
  due date not null,
  kind text not null check (kind in ('d30', 'd7', 'over')),
  sent_at timestamptz not null default now(),
  primary key (org_id, elevator_id, item_id, due, kind)
);
