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
   | `POSTGRES_PASSWORD` | mot de passe de la base (long, aléatoire ; caractères spéciaux acceptés) |
   | `BOOTSTRAP_TOKEN` | jeton aléatoire pour la première installation |
   | `SMTP_URL` | `smtp://utilisateur:motdepasse@hôte:587` (ou `smtps://…:465`) |
   | `MAIL_FROM` | expéditeur des e-mails |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | notifications push d'astreinte (`npx web-push generate-vapid-keys`) |
   | `SMS_PROVIDER` + `TWILIO_*` ou `SMS_WEBHOOK_*` | SMS d'astreinte (optionnel) |
   | `METRICS_TOKEN`, `ERROR_WEBHOOK_URL`, `LOG_LEVEL` | supervision (voir OPERATIONS.md) |

   Toutes les variables sont décrites dans `.env.example`.
3. Onglet **Domains** : domaine → service `app`, port `8787`, HTTPS activé, certificat Let's Encrypt. Le `docker-compose.yml` rattache déjà `app` au réseau `dokploy-network` (sans cela, Traefik ignore le conteneur et répond `404 page not found`). **Redéployer après toute modification du domaine.**
4. **Deploy**. Le healthcheck est `/api/health/ready` (base + migrations).

> Alternative : service *Application* (build Dockerfile) + base *Postgres* créée par Dokploy ; alors renseigner `DATABASE_URL` (mot de passe encodé en URL) ou `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `APP_URL`, `BOOTSTRAP_TOKEN`, `SMTP_URL`, `MAIL_FROM`, `PORT=8787`.

## 3. Première installation et opérateurs
Le plus simple : renseigner `OPERATOR_EMAILS=vous@exemple.fr` (adresses séparées par des virgules) et redéployer. Sur `https://votre-domaine/`, bouton **Se connecter** → saisissez cette adresse : le compte opérateur est créé automatiquement et le lien de connexion vous est envoyé. Ces opérateurs ne peuvent pas être retirés depuis la console (retirez l'adresse de la variable). Autres moyens : le compte créé sur `/#/setup` est aussi opérateur ; `node dist/cli.js operator-add vous@exemple.fr` ; l'onglet Opérateurs de la console.

Un opérateur arrive directement sur la **console** : création des entreprises, offres (onglet Offres), suspensions, demandes, facturation. Le bouton **Ouvrir l'entreprise** l'y fait entrer en administrateur (bandeau orange, bouton **Retour à la console**). Les comptes d'entreprise, eux, n'ont ni bascule ni création d'entreprise.

### Repartir d'une base vide
Efface **toutes** les données (entreprises, comptes, parc, factures, journaux), garde le schéma et le catalogue d'offres. Irréversible : faites une sauvegarde avant.
```bash
docker exec -it <conteneur app> node dist/cli.js reset-database --yes-erase-everything
```
Puis redémarrez l'application et connectez-vous avec une adresse de `OPERATOR_EMAILS`.

### Donner accès à une nouvelle entreprise
1. Soit l'entreprise demande un accès sur `https://votre-domaine/#/signup` ; vous recevez un e-mail et validez dans la console (onglet Demandes).
2. Soit vous la créez directement : **Console opérateur → Créer une entreprise et son administrateur** (nom, offre, nom et e-mail de l'administrateur).
3. L'administrateur reçoit un lien de connexion et une visite guidée ; vous suivez son usage et ajustez son offre dans la console. Vous pouvez suspendre l'entreprise (motif affiché) puis la réactiver.

Les utilisateurs des entreprises ne peuvent pas créer d'entreprise.

## 3 ter. Première installation
1. Ouvrir `https://maintix.mondomaine.fr/#/setup`.
2. Saisir nom de l'entreprise, votre nom, votre e-mail et le `BOOTSTRAP_TOKEN`.
3. Ouvrir le lien reçu par e-mail → vous êtes administrateur.
4. *Réglages* : renseigner **Entreprise et facturation** (raison sociale, RCCM, n° de compte contribuable, régime d'imposition, coordonnées de paiement, mentions légales), inviter techniciens, bureau et clients (portail). *Importer le parc* (Excel, CSV ou copier-coller) pour charger vos appareils.
5. Chaque technicien : *Profil → Alertes d'astreinte* → activer les notifications (sur iPhone : ajouter d'abord Maintix à l'écran d'accueil, iOS 16.4+) et saisir son numéro pour les SMS.
6. Recommandé : retirer `BOOTSTRAP_TOKEN` ensuite (l'installation est de toute façon refusée dès qu'une organisation existe).

### Pas de lien reçu (SMTP absent ou en panne) : générer un lien depuis le serveur
Sur le serveur Dokploy (terminal SSH), sans passer par les journaux ni par l'e-mail :
```bash
docker exec $(docker ps -qf name=app) node dist/cli.js login-link vous@exemple.fr
```
La commande affiche un lien valable 15 minutes, à usage unique, pour un membre existant. Dans Dokploy, le même terminal est disponible depuis le service, onglet **Terminal** (conteneur `app`) : lancer alors simplement `node dist/cli.js login-link vous@exemple.fr`.

## 4. Exploitation
- **Sauvegardes** : planifier la sauvegarde de Postgres et tester la restauration (commandes dans [OPERATIONS.md](OPERATIONS.md)).
- **Mises à jour** : redéployer ; les migrations SQL (`server/migrations`) s'appliquent au démarrage, dans une transaction.
- **Journaux** : connexions, refus de synchronisation, ajouts/retraits de membres, signalements publics → table `audit_log`.
- **Sécurité** : `TRUST_PROXY=1` (par défaut) car Dokploy place un proxy devant l'application ; ne pas exposer le port 8787 directement sur Internet.

## 5. Développer en local (Docker)
```bash
docker network create dokploy-network   # une seule fois
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

## 5 bis. Développer sans Docker
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

## 4. Abonnements, suspension automatique et paiement Jèko

- **Échéances** : un essai (`Fin de l'essai`) ou un abonnement (`Échéance de l'abonnement`, console → fiche de l'entreprise → Offre et plafonds) échu suspend l'entreprise automatiquement (au démarrage puis toutes les heures) et prévient ses administrateurs par e-mail. Sans date, aucune suspension automatique.
- **Motifs de suspension** (table `suspension_reasons`) : *Facture impayée*, *Fin de la période d'essai*, *Échéance de l'offre* peuvent être levés par le **paiement** de l'entreprise (ou par un opérateur) ; *Non-respect des conditions*, *Sécurité*, *Autre* ne peuvent être levés que par un **opérateur**.
- **Paiement** : l'administrateur de l'entreprise choisit l'offre et la durée (1, 3, 6 ou 12 mois) dans Réglages → Abonnement (ou sur l'écran de suspension), puis paie par Jèko (Wave, Orange Money, MTN, Moov, Djamo). Le paiement confirmé prolonge l'abonnement et lève la suspension si le motif le permet.
- **Clés Jèko** : console → **Paiements Jèko** (clé API, identifiant de clé, boutique, secret du webhook ; chiffrées en base, jamais réaffichées). Le bouton *Tester la connexion* liste vos boutiques pour retrouver le `storeId`. Dans votre tableau de bord Jèko (Paramètres → API & Webhooks), renseignez l'URL de notification indiquée dans la console (`https://votre-domaine/api/public/jeko/webhook`) et reportez le secret de signature. Définissez `SECRETS_KEY` pour chiffrer avec une clé hors base.
- **Finances** : console → **Finances** (encaissé, paiements en cours, reste à payer, renouvellements à 30 jours, détail par entreprise, derniers paiements). Un paiement dont la notification n'est pas arrivée peut être confirmé à la main (*Marquer payé*) après vérification dans Jèko ; un paiement reçu hors ligne s'enregistre depuis la même page.

## 5. Rappels d'échéance et pages légales
- **Rappels** : les administrateurs reçoivent un e-mail quand il reste 7 jours, puis 1 jour, avant la fin de l'essai ou de l'abonnement (une fois chacun), avec un bouton vers Réglages → Abonnement. La tâche tourne au démarrage puis toutes les heures.
- **Pages légales** (`/#/legal/mentions`, `/confidentialite`, `/conditions`), liées depuis le pied de la page d'accueil et le formulaire de demande d'accès. Renseignez `LEGAL_NAME`, `LEGAL_EMAIL`, `LEGAL_PHONE`, `LEGAL_ADDRESS`, `LEGAL_REGISTRATION`, `LEGAL_HOST` : seuls les champs renseignés sont affichés. `LEGAL_EMAIL` figure aussi en pied des e-mails. Les textes sont un modèle de départ : à faire relire par un juriste avant publication.

## 6. Plafonds des offres : facturés ou bloquants
Chaque offre (console → Offres) a un mode de dépassement, copié sur l'entreprise à la création, à l'application de l'offre et au paiement, et modifiable par entreprise (Offre et plafonds) :
- **Facturer le dépassement** : l'ajout reste possible, l'interface prévient du supplément (tarifs « technicien/appareil en plus »).
- **Bloquer les ajouts** : une fois le plafond atteint, l'invitation d'un technicien et la création d'appareils (formulaire, import — partiel proposé — et synchronisation) sont refusées côté serveur, avec un message et un accès à Réglages → Abonnement. Modifier ou supprimer l'existant reste possible. L'essai gratuit est bloquant par défaut ; Essentiel et Pro facturent.
Un plafond vide = illimité : jamais bloquant.

## 7. Supprimer une entreprise, vider des données
- **Supprimer une entreprise et toutes ses données** : console → carte de l'entreprise → **Supprimer…** → retaper le nom exact. Sont effacés définitivement : comptes (ceux qui n'appartiennent à aucune autre entreprise), clients, appareils, missions, rapports, factures, photos et signatures, paiements enregistrés (le total encaissé diminue) et journal. Une trace « operator.org.delete » reste dans le journal de la plateforme. Pour couper l'accès en gardant les données : suspension.
- **Vider les données d'une entreprise** (par exemple après les données de démonstration) : Réglages → Aide et données → **Vider les données**, puis taper SUPPRIMER (administrateur). Les comptes, réglages et techniciens liés à un compte sont conservés ; les autres appareils reçoivent les suppressions à leur prochaine synchronisation ; la numérotation des factures repart de zéro. Un opérateur peut le faire dans une entreprise via **Ouvrir l'entreprise**.

## 8. Adaptation à la Côte d'Ivoire
Identifiants d'entreprise : **RCCM**, **n° de compte contribuable (CC)**, **régime d'imposition** et **coordonnées de paiement** (RIB, Wave, Orange Money…) à la place de SIRET/TVA intracommunautaire/IBAN ; ils figurent sur les factures (écran et PDF). Les anciennes valeurs déjà saisies restent lues et sont reprises dans les nouveaux champs à la prochaine modification des réglages. TVA par défaut : **18 %** (modifiable dans Réglages ; les factures déjà créées gardent leur taux). Export comptable avec les comptes SYSCOHADA. Données de démonstration situées à Abidjan.

## 9. Remises, reçus et suivi des encaissements
- **Remises de durée** (paiement d'avance) : 6 mois −10 %, 12 mois −20 % (1 et 3 mois : plein tarif). Elles s'appliquent au paiement en ligne et aux paiements enregistrés hors ligne (sauf si un montant est saisi à la main). Les pourcentages sont dans `shared/pricing.ts`.
- **Reçus PDF** : chaque paiement confirmé reçoit un numéro séquentiel `REC-AAAA-NNNN` et un reçu PDF (offre, période couverte, remise, total, moyen de paiement), envoyé par e-mail aux administrateurs de l'entreprise et téléchargeable depuis Réglages → Abonnement (« Reçu PDF ») et depuis la console, onglet Finances. L'émetteur est celui des variables `LEGAL_*`.
- **Évolution des encaissements** : console → Finances → graphique des 12 derniers mois empilé par offre, détail chiffré par mois, total des remises accordées.
