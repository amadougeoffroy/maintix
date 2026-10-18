# Déploiement sur Dokploy

Un seul service applicatif (API + front servi en statique) et un Postgres.

## 1. Préparer
- Un domaine, ex. `maintix.mondomaine.fr`, pointé vers votre serveur Dokploy (HTTPS géré par Dokploy/Traefik).
- Un compte SMTP (Brevo, Resend, Mailjet, votre serveur…) pour envoyer les liens de connexion.

## 2. Créer l'application (méthode recommandée : Docker Compose)
1. Dokploy → *Create Service* → **Compose** → source : votre dépôt Git, fichier `docker-compose.yml`.
2. Onglet **Environment** : renseigner (voir `.env.example`) :
   | Variable | Rôle |
   |---|---|
   | `APP_URL` | URL publique exacte, en **https** |
   | `POSTGRES_PASSWORD` | mot de passe de la base (long, aléatoire) |
   | `BOOTSTRAP_TOKEN` | jeton aléatoire pour la première installation |
   | `SMTP_URL` | `smtp://utilisateur:motdepasse@hôte:587` (ou `smtps://…:465`) |
   | `MAIL_FROM` | expéditeur des e-mails |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | notifications push d'astreinte (`npx web-push generate-vapid-keys`) |
   | `SMS_PROVIDER` + `TWILIO_*` ou `SMS_WEBHOOK_*` | SMS d'astreinte (optionnel) |
   | `METRICS_TOKEN`, `ERROR_WEBHOOK_URL`, `LOG_LEVEL` | supervision (voir OPERATIONS.md) |

   Toutes les variables sont décrites dans `.env.example`.
3. Onglet **Domains** : domaine → service `app`, port `8787`, HTTPS activé.
4. **Deploy**. Le healthcheck est `/api/health/ready` (base + migrations).

> Alternative : service *Application* (build Dockerfile) + base *Postgres* créée par Dokploy ; alors renseigner `DATABASE_URL`, `APP_URL`, `BOOTSTRAP_TOKEN`, `SMTP_URL`, `MAIL_FROM`, `PORT=8787`.

## 3. Première installation
1. Ouvrir `https://maintix.mondomaine.fr/#/setup`.
2. Saisir nom de l'entreprise, votre nom, votre e-mail et le `BOOTSTRAP_TOKEN`.
3. Ouvrir le lien reçu par e-mail → vous êtes administrateur.
4. *Réglages* : renseigner **Entreprise et facturation** (raison sociale, SIRET, TVA, IBAN, mentions légales), inviter techniciens, bureau et clients (portail). *Importer le parc* (Excel, CSV ou copier-coller) pour charger vos appareils.
5. Chaque technicien : *Profil → Alertes d'astreinte* → activer les notifications (sur iPhone : ajouter d'abord Maintix à l'écran d'accueil, iOS 16.4+) et saisir son numéro pour les SMS.
6. Recommandé : retirer `BOOTSTRAP_TOKEN` ensuite (l'installation est de toute façon refusée dès qu'une organisation existe).

## 4. Exploitation
- **Sauvegardes** : planifier la sauvegarde de Postgres et tester la restauration (commandes dans [OPERATIONS.md](OPERATIONS.md)).
- **Mises à jour** : redéployer ; les migrations SQL (`server/migrations`) s'appliquent au démarrage, dans une transaction.
- **Journaux** : connexions, refus de synchronisation, ajouts/retraits de membres, signalements publics → table `audit_log`.
- **Sécurité** : `TRUST_PROXY=1` (par défaut) car Dokploy place un proxy devant l'application ; ne pas exposer le port 8787 directement sur Internet.

## 5. Développer en local
```bash
cd server && npm install && npm run dev      # API sur :8787 (base embarquée sans DATABASE_URL, liens de connexion dans la console)
npm run dev                                   # front sur :5173, /api proxifié vers :8787
```
Sans API, le front démarre en **mode démonstration** (données locales).

## 6. Tests
```bash
npm test                      # unitaires front
npm run test:e2e              # E2E mode démo : Chromium, WebKit, Firefox (accessibilité claire/sombre, clavier)
npm run test:e2e:server       # E2E mode serveur (API + synchro entre deux appareils)
cd server && npm test         # API (Postgres embarqué)
cd server && TEST_DATABASE_URL=postgres://… npm test   # API contre un vrai Postgres
```
