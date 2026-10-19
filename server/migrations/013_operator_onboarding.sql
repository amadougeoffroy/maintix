-- Avancement du didacticiel d'un opérateur entré dans une entreprise dont il n'est pas membre (il n'a pas de ligne dans `members`).
create table operator_onboarding (
  user_id uuid not null references users on delete cascade,
  org_id uuid not null references organisations on delete cascade,
  onboarding jsonb not null default '{}',
  primary key (user_id, org_id)
);
