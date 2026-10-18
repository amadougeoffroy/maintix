# Exploitation

## Sondes et supervision
| Point d'accès | Usage |
|---|---|
| `GET /api/health` | **Vie** : le processus répond (renvoie la version). |
| `GET /api/health/ready` | **Disponibilité** : base joignable et migrations appliquées, sinon 503. Sonde Docker / Uptime Kuma / Dokploy. |
| `GET /api/metrics` | Prometheus, `Authorization: Bearer $METRICS_TOKEN` (404 si le jeton n'est pas défini). |

### Métriques exposées
`http_requests_total{method,route,status}`, `http_request_duration_seconds` (histogramme), `sync_push_ops_total{result}`, `auth_logins_total`, `rate_limited_total`, `errors_total`, `maintix_open_alerts` (alertes d'astreinte non acquittées), `maintix_db_up`, `maintix_orgs`.

### Alertes recommandées
- `/api/health/ready` en échec > 2 min.
- `maintix_open_alerts > 0` depuis plus de 15 min (panne non prise en charge).
- Part de `http_requests_total{status=~"5.."}` > 1 % sur 5 min ; `errors_total` en hausse.
- `rate_limited_total` en forte hausse (abus ou attaque).
- `histogram_quantile(0.95, http_request_duration_seconds_bucket)` > 1 s.
- Espace disque du volume Postgres < 20 %.

### Journaux
Une ligne JSON par requête API (`ts, level, msg, reqId, method, path, status, ms, ip`) : jamais de corps de requête, de jeton ni d'adresse e-mail. Le `reqId` est aussi renvoyé dans l'en-tête `X-Request-Id` et dans le corps des erreurs 500 : demandez-le à l'utilisateur pour retrouver l'incident.
`ERROR_WEBHOOK_URL` reçoit `{"text": "Maintix : …"}` pour chaque erreur 500 (1 par minute et par message).

## Sauvegarde et restauration (Postgres)
```bash
# sauvegarde (depuis l'hôte Dokploy)
docker compose exec -T db pg_dump -U cabine -Fc cabine > maintix-$(date +%F).dump
# restauration sur une base vide
docker compose exec -T db pg_restore -U cabine -d cabine --clean --if-exists < maintix-2026-10-18.dump
```
La base contient **tout** (données, photos, signatures, factures, journal). Planifiez une sauvegarde quotidienne, conservez-la hors du serveur, et **testez la restauration** au moins une fois par trimestre.

## Performances mesurées
Banc d'essai (`server/scripts/load.mjs`) sur un poste de développement (API compilée + Postgres 16 en conteneur, client de charge sur la même machine), techniciens synchronisant 10 missions chacun (push + pull toutes les ~250 ms, envoi de photos) :

| Techniciens | Débit | Latence p95 (push / pull / fichier) | Erreurs |
|---|---|---|---|
| 30 | 316 req/s | 10 / 4 / 5 ms | 0 |
| 150 | 1 368 req/s | 43 / 39 / 62 ms | 0 |

C'est un ordre de grandeur, pas une garantie : à refaire sur votre serveur (`node server/scripts/load.mjs --help` dans l'en-tête du script).

## Montée de version
Redéployer : les migrations (`server/migrations`) s'appliquent au démarrage, chacune dans une transaction. Les sessions et la file d'envoi des appareils survivent.
