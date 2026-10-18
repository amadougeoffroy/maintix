-- Avancement du didacticiel par membre et par entreprise (visite d'accueil vue, étapes cochées à la main).
alter table members add column onboarding jsonb not null default '{}'::jsonb;
