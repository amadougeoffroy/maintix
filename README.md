# Maintix – maintenance d’ascenseurs

> Chaque visite, tracée. Charte graphique : [docs/branding](docs/branding/maintix-charte-graphique.pdf) (`npm run brand` pour régénérer logos et charte).

PWA mobile-first, **offline-first** (IndexedDB) avec **API + Postgres auto-hébergés** (authentification par lien magique, synchronisation multi-appareils). Sans API, l'application démarre en mode démonstration. Vision : [PRODUIT.md](PRODUIT.md) · Backend : [docs/BACKEND.md](docs/BACKEND.md) · Déploiement Dokploy : [docs/DEPLOY.md](docs/DEPLOY.md) · Exploitation : [docs/OPERATIONS.md](docs/OPERATIONS.md).

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests unitaires (store, import, notes)
npm run test:e2e # E2E Playwright (Chromium/WebKit/Firefox) + accessibilité axe, mode sombre, clavier
npm run test:e2e:server # E2E avec vraie API : connexion, synchro entre deux appareils
npm run test:server     # tests de l'API (Postgres embarqué ; TEST_DATABASE_URL pour un vrai Postgres)
npm run dev:server      # API sur :8787 (le front la proxifie)
docker compose up -d --build   # prod : app + Postgres (voir .env.example)
npm run build    # build PWA dans dist/
```

## Profils de démo (écran d'accueil)
- **Technicien** : ma journée, scan QR, fiche appareil, visite en étapes (sécurité → 7 zones → mesures → pièces → signature), dépannage, urgences, habilitations.
- **Bureau** : tableau de bord, planning (report/annulation, garde-fou habilitation), parc, clients/sites/contrats (CRUD), import CSV/Excel (copier-coller), défauts, devis, astreinte, QR imprimables, dossier de contrôle technique imprimable, réglages.
- **Client** : portail (santé du parc, défauts, devis à accepter, rapports), signalement public `#/signal/:id`, page d'état `#/status/:id`.

## Ce qui est réel / ce qui reste à faire
- Réel : checklist versionnable, défauts auto-créés, prochaine visite planifiée selon le contrat, rapport imprimable scellé SHA-256 (vérifiable), astreinte, mesures avec alerte de dérive.
- Note dictée : « ✨ Analyser la note » propose pièces, défauts et test d'appel (heuristique locale, validation humaine).
- Backend : API Hono + Postgres, liens magiques, sessions, synchro push/pull, rapports scellés vérifiés côté serveur, signalement public QR (voir docs/BACKEND.md).
- Mode démo (sans serveur) : e-mail via `mailto:`, pas de push/SMS. IA : la dictée utilise la Web Speech API du navigateur, l'analyse de note est une heuristique locale.
- Ajouts récents : photos/signatures en stockage adressé par empreinte, PDF serveur + e-mail du rapport, contrats (reconduction, préavis, indexation), facturation numérotée + journal CSV/FEC, historique des modifications, multi-entreprises, alertes d'astreinte (push, SMS, escalade), recherche globale (Ctrl/⌘ K), fiche client, import .xlsx, pictogrammes métier, supervision (logs JSON, métriques, sondes), CI GitHub Actions.
- À faire : IA (note vocale → rapport, OCR de plaque), intégrations comptables directes, stockage objet S3 pour de très gros volumes.
- Les points de checklist et la réglementation sont à faire valider par un professionnel avant tout usage réel.
