# Plateforme Maintenance Ascenseurs — Dossier produit

> Question centrale : **« Quel ascenseur doit être entretenu, par qui, et qu'est-ce qui a été fait ? »**

*Les références réglementaires ci-dessous sont à faire valider par un professionnel du métier avant toute promesse commerciale.*

---

## 1. Positionnement

**Cible** : les entreprises indépendantes de maintenance d'ascenseurs (3 à 40 techniciens), face aux grands groupes (Otis, Kone, Schindler, TK Elevator) qui ont leurs propres outils internes. Ces PME travaillent encore beaucoup avec papier, Excel et des GMAO généralistes.

**Clients finaux** : syndics de copropriété, bailleurs sociaux, gestionnaires d'ERP (hôpitaux, hôtels, centres commerciaux), entreprises.

**Pourquoi ce métier est un bon vertical**
- Obligations légales fortes : contrat d'entretien, carnet d'entretien, contrôle technique périodique par organisme agréé, mise en conformité sécurité.
- Récurrence : visites d'entretien régulières (souvent mensuelles ou bimestrielles) sur un parc stable pendant des années.
- Urgence réelle : personne bloquée en cabine, panne sur un immeuble sans autre accès → l'astreinte est un cœur de métier.
- Très documentaire : chaque appareil a une histoire (modèle, charge, nb d'arrêts, machinerie, normes) qui se perd quand les papiers se perdent.

**Défi à anticiper** : les grands groupes verrouillent leurs clients par la durée des contrats. L'angle gagnant est de **simplifier la vie des indépendants** et de **fournir au client final de la transparence** (là où les majors sont opaques).

**Nom de travail** : `Cabine`, `Palier`, `Carnet+`… (le *carnet d'entretien vivant* de chaque appareil).

---

## 2. Personas et besoins

| Persona | Contexte | Besoin n°1 |
|---|---|---|
| **Moussa, technicien** | Seul sur le terrain, machinerie en toiture ou cuvette en sous-sol, mains sales, réseau faible | Terminer une visite en quelques minutes, ne rien oublier, ne pas ressaisir |
| **Hélène, responsable d'exploitation / planning** | Gère les tournées, l'astreinte et les clients qui appellent | Voir qui est où, réagir aux urgences, prévoir les visites |
| **Syndic / gestionnaire** | Cherche la preuve que l'entretien est fait | Rapport clair, historique, échéances, signalement simple |
| **Dirigeant** | Marge, conformité, responsabilité en cas d'accident | Traçabilité opposable, facturation rapide |
| **Résident / usager** *(plus tard)* | Ascenseur en panne | Savoir si c'est signalé et quand c'est réparé |

---

## 3. Principes mobile-first

1. **Utilisable avec des gants**, une seule main, en pleine lumière ou en local sombre (gros boutons, contraste fort, mode sombre).
2. **Offline-first** : cuvettes, caves et machineries n'ont souvent aucun réseau. Tout doit marcher hors ligne et se synchroniser ensuite.
3. **Zéro saisie évitable** : toggles, listes, photo, dictée vocale, scan.
4. **Un flux linéaire**, étape par étape, jamais un formulaire géant.
5. **Pré-remplissage radical** : appareil, historique, dernière valeur mesurée, pièces habituelles.
6. **Le rapport s'écrit tout seul** : le technicien valide, il ne rédige pas.
7. **PWA d'abord** (aucun store, déploiement immédiat), natif plus tard si nécessaire (NFC, caméra avancée).
8. **Sécurité du technicien** : l'app ne doit jamais le pousser à sauter une étape de sécurité (consignation, verrouillage).

---

## 4. Le parcours technicien (visite d'entretien)

```
Ma journée → Appareil (scan QR) → Consignes de sécurité → Checklist par zone → Constats/photos → Pièces & temps → Signature → Envoi
```

1. **Ma journée** : tournée ordonnée, bouton « Y aller », statut en un tap.
2. **Scan du QR collé à la machinerie/cabine** : ouvre la fiche appareil, son historique, les défauts ouverts, les accès (digicode, clés, gardien).
3. **Consignes de sécurité** : rappel des risques propres au site (accès toiture, cuvette peu profonde, machinerie sans local) et des étapes de consignation. Case « consignation effectuée » horodatée.
4. **Checklist par zone** : *machinerie → cabine → portes palières → gaine/cuvette → parachute/limiteur → câbles/suspentes → appel d'urgence*. Chaque ligne : ✅ OK / ⚠️ À surveiller / ❌ Défaut. Un ❌ exige photo + note (vocale possible).
5. **Mesures** quand pertinent (isolement, courant moteur, usure des câbles, jeu des portes) avec **rappel de la dernière valeur** et alerte en cas de dérive.
6. **Test de l'appel d'urgence** : résultat consigné et horodaté (c'est un point sensible côté responsabilité).
7. **Pièces et temps** : catalogue personnel (les plus utilisées en premier).
8. **Signature** du gardien/syndic/gestionnaire, ou **« client absent »** avec photo de l'affichage en cabine (cas fréquent : personne sur place).
9. **Envoi automatique** du rapport PDF au client et au bureau.

### Parcours dépannage / urgence
- Alerte reçue (appel de cabine, client, résident via QR) → **dispatch** vers le technicien d'astreinte le plus proche et habilité.
- Fiche d'urgence : **personne bloquée ? oui/non**, immeuble, étage, accès, historique des pannes récentes.
- Chronologie automatique : heure d'appel, de prise en charge, d'arrivée, de remise en service. Utile pour les engagements de délai et les litiges.
- Compte rendu court + cause probable + actions suivantes (devis, immobilisation).

---

## 5. Idées innovantes et modernes

### 5.1 IA utile, pas gadget
- **Note vocale → rapport structuré** : « Porte palière 3e, galet usé remplacé, jeu corrigé, test appel OK » → l'IA remplit constats, pièces, durée et rédige le compte rendu. Le technicien relit.
- **Photo de plaque / armoire → fiche appareil** : OCR pour marque, modèle, n° de série, année, charge, nombre d'arrêts, type de machine. Création de l'appareil en 10 secondes.
- **Lecture des codes défaut** : le technicien saisit ou photographie le code de la manœuvre → causes probables et procédure issues de la base de connaissances (constructeur + historique interne).
- **Maintenance prédictive simple** : suivi des pannes par appareil (fréquence de défaut de porte, d'arrêt intempestif) → score de risque et recommandation (« remplacer les galets avant la panne »).
- **Génération de devis** : défaut + pièces + temps → devis prêt à envoyer au syndic en un clic. C'est là que se fait la marge sur les travaux hors contrat.
- **Résumé syndic** : l'IA transforme un jargon technique en phrase claire et neutre pour le client (« la porte du 3e est usée, remplacement conseillé sous 3 mois »).

### 5.2 Le « passeport » de l'appareil
- **QR code résistant** par ascenseur, double usage : technicien (fiche interne) et public (signalement de panne).
- **Timeline complète** : installation, modernisations, pannes, pièces, contrôles techniques, mises en conformité.
- **Dossier prêt pour le contrôle technique** : un clic assemble carnet d'entretien, rapports, défauts levés, preuves de correction.
- **Suivi des défauts du contrôle technique** : chaque non-conformité relevée par l'organisme est suivie jusqu'à sa levée (échéance, devis, travaux, preuve).

### 5.3 Planification intelligente
- **Calendrier automatique** des visites d'entretien selon le contrat et la périodicité.
- **Tournées optimisées** par zone, en tenant compte des habilitations.
- **Astreinte** : planning de garde, bascule automatique si pas d'accusé de réception sous X minutes, escalade vers le suivant.
- **Alerte habilitation** : impossible d'affecter un technicien dont l'habilitation (électrique, travaux en hauteur, etc.) est expirée.
- **Rattrapage** : visites en retard remontent en priorité avec explication (accès refusé, pièce en attente…).

### 5.4 Expérience client et transparence
- **Portail syndic sans mot de passe** (lien magique) : parc, derniers rapports, prochaines visites, défauts ouverts, devis à valider en ligne.
- **Page publique d'état par ascenseur** : « signalé à 8h12 · technicien en route · remis en service à 10h40 » (réduit les appels et les tensions).
- **Signalement par QR** : l'usager décrit la panne + photo, sans compte, crée une demande pré-qualifiée (avec détection de « personne bloquée » → priorité maximale).
- **Score de santé du parc** par site (vert/orange/rouge) basé sur âge, pannes, défauts ouverts.
- **Rapports lisibles** : une page claire, photos avant/après.

### 5.5 Conformité et preuve
- **Rapports horodatés et scellés** (hash) : valeur probante en cas d'accident ou de litige.
- **Carnet d'entretien numérique** mis à jour automatiquement à chaque visite.
- **Registre des échéances** : contrôles techniques, mises en conformité, visites périodiques, tests périodiques.
- **Journal d'audit** : qui a fait quoi, quand, depuis où.

### 5.6 Intégrations et automatisation
- **Import du parc existant** : déposer un Excel, l'IA mappe les colonnes et crée sites et appareils.
- **Facturation** : export vers Pennylane, Sage, QuickBooks, Indy ou CSV ; facturation périodique des contrats.
- **Contrats** : reconduction, indexation annuelle des prix, alertes de résiliation.
- **Notifications** : push, SMS, e-mail ; WhatsApp pour les contacts qui n'ont pas d'app.
- **API / webhooks** pour intégrateurs.
- **Appel d'urgence** : connexion future aux télésurveillances/GSM de cabine pour créer une intervention automatiquement.

---

## 6. Écrans clés (MVP)

**Mobile (technicien)** : Ma journée · Fiche appareil · Visite (stepper) · Urgence · Signature & envoi.
**Web (bureau)** : Planning & astreinte · Parc (clients / sites / appareils) · Contrats · Rapports · Défauts & devis · Réglages.
**Portail client** : Parc & santé · Historique · Signaler une panne · Valider un devis.

---

## 7. Modèle de données

```
Organisation ─┬─ Utilisateur (rôle, habilitations + dates d'expiration)
              ├─ Client (syndic, bailleur, ERP) ── Site (adresse, accès, contacts)
              │       └─ Appareil (type, marque, modèle, n° série, charge, arrêts, machinerie, année, QR)
              ├─ Contrat (périodicité, appareils couverts, prix, astreinte, indexation)
              ├─ Intervention (type : entretien | dépannage | travaux | contrôle ; statut ; technicien ; horodatages)
              │     ├─ Réponses checklist (zone, point, statut, photo, note)
              │     ├─ Mesures
              │     ├─ Pièces & temps
              │     ├─ Entrave / personne bloquée (oui/non, chronologie)
              │     └─ Signature ou « client absent » + rapport PDF scellé
              ├─ Défaut (origine : visite | contrôle technique | signalement ; gravité ; échéance ; preuve de levée)
              ├─ Modèle de checklist (par type d'appareil, versionné)
              └─ Devis / Facture
```

Attention : checklists **versionnées** (un rapport ancien garde la checklist de son époque), multi-organisation dès le début, journal d'audit.

---

## 8. Architecture technique

- **Front** : Next.js / React en PWA (offline, caméra, push), Tailwind + composants accessibles.
- **Offline & sync** : base locale synchronisée (PowerSync / ElectricSQL / RxDB) ou file d'actions IndexedDB avec règles de conflit par champ.
- **Back** : Postgres (Supabase ou autohébergé), Row Level Security par organisation, stockage objets pour photos compressées côté client.
- **PDF** : génération serveur à partir de gabarits HTML, hash SHA-256 stocké à la signature.
- **IA** : API Claude pour transcription structurée, OCR de plaque, résumé client ; sorties validées par schéma strict, **toujours relues par un humain**.
- **Alertes** : Web Push + SMS + e-mail, avec accusé de réception pour l'astreinte.
- **Hébergement UE** (RGPD), sauvegardes chiffrées.
- **Tests** : parcours « visite complète » en mode avion en test automatisé.

---

## 9. Feuille de route

**Phase 0 — Validation (2–3 semaines, avant le code)**
- 10 entretiens : techniciens, responsables d'exploitation, syndics.
- Récupérer 5 vrais rapports de visite, carnets d'entretien et un rapport de contrôle technique.
- Maquette cliquable du flux visite, testée sur 3 techniciens.
- Vérification réglementaire avec un professionnel.

**Phase 1 — MVP (6–8 semaines)** : *la visite se termine et le syndic reçoit le PDF signé.*
Comptes/organisations · parc · QR · visites planifiées · checklist par zone · photos · signature / client absent · PDF scellé · offline · envoi e-mail.

**Phase 2 — Valeur métier (6–8 semaines)** : dépannage + astreinte · suivi des défauts du contrôle technique · contrats & échéances · note vocale → rapport · OCR plaque.

**Phase 3 — Croissance** : portail syndic · devis en ligne · page d'état publique · optimisation de tournées · prédictif · intégrations compta et télésurveillance.

---

## 10. Modèle économique

- **Abonnement par technicien actif** (ordre de grandeur 20 000 – 33 000 FCFA par mois), possible palier par nombre d'appareils.
- Essai 30 jours, **import du parc offert** (principale friction).
- Options : portail client en marque blanche, module devis/facturation, astreinte avancée, API.
- Distribution : réseaux d'indépendants du secteur, syndicats professionnels, salons, formation, relations avec des cabinets de syndics (ils exigent la transparence et poussent leurs prestataires à s'équiper).

---

## 11. Risques

| Risque | Parade |
|---|---|
| Responsabilité en cas d'accident | Aucune « validation de sécurité » automatique : l'app trace, elle ne certifie pas. CGU et mentions claires, avis d'un juriste |
| Techniciens réfractaires | Co-conception, 5 min de prise en main, gain visible dès le premier jour |
| Réseau absent en cuvette | Offline-first dès le MVP |
| Évolutions de la réglementation | Checklists et échéances paramétrables et versionnées |
| Hallucinations de l'IA | Pas d'écriture sans validation humaine, schéma strict, traçabilité de ce qui est généré |
| Données sensibles (digicodes, accès) | Chiffrement, droits par rôle, journal d'accès |
| Majors verrouillent le marché | Cibler les indépendants et les syndics en quête de transparence |
| Migration des données | Import assisté + service d'onboarding |

---

## 12. Indicateurs

- Temps de saisie moyen par visite (< 5 min).
- % de rapports envoyés dans l'heure.
- % de visites contractuelles réalisées dans les délais.
- Délai moyen de prise en charge d'une urgence.
- % de défauts du contrôle technique levés dans le délai.
- Techniciens actifs hebdo / sièges payés ; rétention à 90 jours.

---

## 13. Prochaines actions

1. Trouver 2–3 entreprises d'ascenseurs indépendantes prêtes à t'ouvrir leurs process.
2. Collecter des rapports de visite, carnets et rapports de contrôle technique réels.
3. Dessiner le flux visite en 5 écrans.
4. Prototype PWA : scan → checklist par zone → signature/client absent → PDF.
5. Test terrain avec 2–3 techniciens, puis priorisation du MVP.
