-- Dernière organisation utilisée : sert à la prochaine connexion d'un utilisateur multi-entreprises.
alter table users add column last_org_id uuid references organisations on delete set null;
