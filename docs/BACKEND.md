# Backend Maintix

API Node (Hono) + Postgres, auto-hébergée (Dokploy). Aucun service tiers hormis un SMTP (et, en option, un fournisseur de SMS).

```
Navigateur (PWA, IndexedDB)  ⇄  /api  ⇄  Postgres
 file d'envoi + curseur + blobs   Hono     users, members, sessions, docs, files, audit_log, alerts…
```

## Authentification et sécurité
- **Lien magique** : `POST /api/auth/request-link` (réponse identique que l'adresse existe ou non) → e-mail `#/auth?token=…`. Jeton 256 bits **haché** en base, **15 min**, **usage unique** ; échange par `POST /api/auth/verify`.
- **Session** : cookie **HttpOnly, SameSite=Lax, Secure** ; en https le nom est préfixé **`__Host-`** (lié à l'hôte, sans Domain). 30 jours, stockée hachée, **10 sessions actives maximum** par utilisateur, révoquée à la déconnexion ou au retrait du membre.
- **CSRF** : écriture = JSON (ou image pour `PUT /api/files`) + `Origin` identique à `APP_URL`.
- **En-têtes** : CSP stricte (`script-src 'self'`, `frame-ancestors 'none'`…), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (caméra/micro seulement), HSTS en https, `Cache-Control: no-store` sur l'API.
- **Débit** : limiteur **partagé en base** (fenêtres fixes), donc valable avec plusieurs instances : demandes de lien 5/h/adresse et 20/h/IP, signalements publics, PDF, envois, abonnements…
- **Installation** : `POST /api/bootstrap` + `x-bootstrap-token` (comparaison à temps constant, verrou de table : une seule organisation créée même en cas d'appels simultanés). Désactivée sans `BOOTSTRAP_TOKEN`.
- **Rôles d'entreprise** : `admin`, `bureau`, `tech`, `client`. **Un compte appartient à une seule entreprise** : pas de bascule (`/api/orgs` et `/api/auth/switch-org` supprimés), et l'invitation d'une adresse déjà membre d'une autre entreprise est refusée (`in_other_org`).
- **Opérateurs de la plateforme** : rôle distinct (table `operators`), rattachés à l'entreprise « plateforme » (`organisations.kind = 'platform'`, jamais listée ni facturée) ; leur page par défaut est la console. Seuls eux créent des entreprises, gèrent le catalogue d'offres (`plans`, `/api/operator/plans`) et entrent dans une entreprise cliente (`POST /api/operator/orgs/:id/enter`, en administrateur, tracé dans le journal) puis reviennent (`POST /api/operator/leave`). Les adresses de `OPERATOR_EMAILS` sont créées et promues automatiquement et **ne peuvent pas être retirées** depuis la console (409 `env_operator`). Autres moyens : `node dist/cli.js operator-add <e-mail>` ou l'onglet Opérateurs.
- Dépendances : `npm audit` sans alerte (surveillé en CI).

## Synchronisation
Documents JSON par entreprise (`docs`) : `clients, sites, elevators, techs, contracts, onCall, jobs, defects, quotes, invoices, settings`.
- `POST /api/sync/push` : droits + intégrité par opération (`forbidden`, `immutable`, `bad_hash`, `use_issue`, `too_large`, `invalid`) ; la version serveur fait foi en cas de refus.
- `GET /api/sync/pull?since=N` : pagination, tombstones, périmètre réduit pour un client.
- Client : détection des changements, **file persistante**, envoi au retour du réseau / toutes les 20 s, un document en attente n'est jamais écrasé par un pull.
- Limite d'un document : 3 Mo (les images ne sont plus dedans).

### Rapports scellés
SHA-256 d'un JSON **canonique** (`shared/canonical.ts`) recalculé par le serveur ; clôturé = immuable (seul `sentAt` change). Les fichiers étant adressés par leur empreinte, le sceau couvre aussi les photos.

### Factures
- Brouillon libre (synchronisé) ; **l'émission passe par `POST /api/invoices/:id/issue`** : numéro `FAC-AAAA-NNNN` attribué atomiquement (compteur par entreprise et année, **sans trou** même en émissions simultanées), date d'émission, échéance.
- Une facture émise est **figée** (lignes, numéro, client, TVA, dates) ; seuls paiement, note et annulation évoluent ; jamais supprimée. Un brouillon ne peut pas être « émis » ni numéroté par un envoi direct.
- PDF (`GET /api/invoices/:id/pdf`) et envoi e-mail avec pièce jointe (`POST /api/invoices/:id/send`). Exports client : journal des ventes CSV et **écritures comptables** (comptes SYSCOHADA : 411, 706, 4431, 521, à valider avec votre expert-comptable).

## Fichiers (photos, signatures)
`PUT /api/files/:sha256` : le serveur vérifie l'empreinte, le type (JPEG/PNG/WebP) et la taille (10 Mo) ; stockage Postgres (`bytea`), isolé par entreprise, lecture `immutable`. Un client ne lit que les fichiers de ses rapports clôturés. Le client envoie les fichiers **avant** les documents qui les référencent.

## Rapports PDF et e-mail
`GET /api/reports/:id/pdf` (pdfkit : logo vectoriel, points de contrôle, photos, signature, sceau revérifié) et `POST /api/reports/:id/send`.

## Historique des modifications
Toute écriture synchronisée est journalisée (`audit_log`) avec clés modifiées et, pour les valeurs courtes, ancienne → nouvelle valeur. `GET /api/audit?collection=&id=` (bureau/admin), affiché dans la fiche appareil, les factures et la page « Journal ».

## Alertes d'astreinte
- Nouveau dépannage non pris en charge (synchro, signalement public QR) → **Web Push** au technicien affecté, sinon à l'astreinte du jour, sinon au bureau.
- **SMS** (Twilio ou webhook) pour une personne bloquée, une escalade, ou quand aucun appareil n'est abonné.
- **Escalade** : sans prise en charge au bout de `ESCALATION_MINUTES`, niveau 1 (+ bureau), puis niveau 2 (+ administrateurs). S'arrête dès que la mission change de statut. Un échec de notification ne bloque jamais la synchronisation.
- Service worker personnalisé (`src/sw.ts`) : push, clic → ouverture de la mission, cache hors ligne.

## Console opérateur (`/#/operator`, API `/api/operator/*`)
Réservée aux opérateurs ; elle n'expose que des **compteurs**, jamais le contenu métier d'une entreprise.
- **Entreprises** : liste avec offre, usage (techniciens, appareils, clients, missions sur 30 jours, dernière activité), montant mensuel estimé, alertes (plafond dépassé, essai expiré).
- **Création d'une entreprise + de son premier administrateur** en une action (compte créé si l'adresse est nouvelle, e-mail d'accueil avec lien de connexion, visite guidée au premier accès).
- **Offres** (essai 30 j, Essentiel, Pro, Sur mesure, Interne) préremplies puis ajustables par entreprise : plafonds, forfait mensuel et prix des techniciens/appareils en plus, **en FCFA**. Les dépassements ne bloquent rien : ils sont facturés.
- **Suspension / réactivation** avec motif : l'entreprise voit un écran « Accès suspendu », l'API répond `403 org_suspended`, le signalement QR et la page d'état de ses appareils sont désactivés, aucune alerte d'astreinte n'est émise. Les données sont conservées ; l'opérateur garde la console même si sa propre entreprise est suspendue.
- **Inscription en libre-service** (`/#/signup`, `POST /api/public/signup`) : champ piège anti-robots, limites de débit (5/h/IP, 3/jour/adresse), même réponse que la demande soit nouvelle, doublon ou ignorée. Confirmation au demandeur, e-mail aux opérateurs, **validation manuelle** (approuver crée l'entreprise et invite l'administrateur ; refuser prévient le demandeur avec le motif).
- **Usage et facturation de la plateforme** : montants estimés par entreprise, **figeage mensuel** (`usage_snapshots`, relançable) et export CSV en FCFA. Chaque entreprise voit sa propre offre et son usage dans Réglages → Entreprise (`GET /api/org/plan`).
- Toute action d'opérateur est tracée dans le journal.

## Monnaie
Tous les montants sont en **francs CFA (FCFA)**, entiers (pas de centimes) : calculs partagés dans `shared/money.ts`, PDF, CSV et tableaux de bord. Le taux de TVA reste un réglage de l'entreprise.

## Supervision
Voir [OPERATIONS.md](OPERATIONS.md) : journal JSON, `X-Request-Id`, `/api/health`, `/api/health/ready`, `/api/metrics`, webhook d'erreurs.

## Limites connues
- Photos en `bytea` Postgres : au-delà de quelques dizaines de Go, prévoir S3/MinIO.
- Escalade par balayage toutes les 30 s (instance unique recommandée pour le balayage ; les endpoints, eux, supportent plusieurs instances).
- Pas d'avoir (note de crédit) : une facture émise se désactive par « annulée » ; la facture rectificative se saisit comme nouvelle facture.
- Pas de rattachement d'un même appareil à plusieurs clients ; pas de multi-devises.
