# CARBUGUI API

Backend Node.js / Express / Prisma (MySQL) pour Carbugui — l'application qui
localise en temps réel les stations-service de Guinée ayant de l'essence, du
gasoil, du gaz ou des lubrifiants, avec un tableau de bord pour les stations
et un back-office admin.

## ⛽ Fonctionnalités

- **Chauffeurs** : connexion par code SMS (OTP) puis code PIN pour les
  ouvertures suivantes (évite de reconsommer un SMS tant que la session est
  valide), abonnement payant (24 heures ou 1 mois, paiement Djomy),
  recherche des stations à proximité, détail d'une station, signalement
  d'une info erronée, chat d'assistance (bot + escalade vers un agent).
- **Stations** : auto-inscription (compte en attente de validation) ou
  connexion par code + mot de passe, mise à jour de la disponibilité/prix
  par produit (ESSENCE, GASOIL, GAZ, LUBRIFIANT), ouverture/fermeture,
  historique d'activité.
- **Admin** : gestion des comptes (validation des inscriptions station), des
  stations (CRUD + import OpenStreetMap), des marques/zones, supervision des
  signalements et des conversations, envoi (immédiat ou programmé) de SMS
  personnalisés à une liste de comptes, suivi des abonnements et paiements,
  prix des formules.

## 🗂 Structure du projet

```
controllers/
  app/        Contrôleurs consommés par l'app chauffeur
  station/    Contrôleurs du tableau de bord station
  admin/      Contrôleurs du back-office
  webhooks/   Callbacks des prestataires (Djomy)
routes/       Mêmes sous-dossiers, un fichier de routes par domaine
middleware/   auth (JWT), requireStationAccess, requireSubscription,
              errorHandler
utils/        prisma (client partagé), jwt, sms (NimbaSMS), email, geo,
              chatBot, stationImportService (OSM), products, djomy
              (client API paiement), subscriptions (abonnements)
prisma/       schema.prisma, migrations, seed.js, data/ (imports figés)
scripts/      export-openapi, import-book1-sites
docs/         openapi.js / openapi.json, notes de version
```

## 🚀 Démarrage

```bash
npm install
cp .env.example .env   # puis renseigner les vraies valeurs
npx prisma migrate deploy
npm run seed            # crée les zones, les formules d'abonnement et un compte admin
npm run dev
```

Le compte admin de démarrage est affiché dans la console par `npm run seed`
(`SEED_ADMIN_PHONE` / `SEED_ADMIN_PASSWORD` dans `.env` pour le personnaliser).
Changez son mot de passe après la première connexion.

Toutes les données sensibles (base, JWT, SMS, Djomy…) sont lues depuis
`.env`, qui n'est jamais commité : voir `.env.example` pour la liste.

## 💳 Abonnements & paiement (Djomy)

Un chauffeur doit avoir un abonnement en cours pour consulter les stations
(`402 SUBSCRIPTION_REQUIRED` sinon) :

| Formule | Code | Prix par défaut | Durée |
|---|---|---|---|
| 24 heures | `DAY` | 2 000 GNF | 24 h |
| 1 mois | `MONTH` | 10 000 GNF | 30 jours |

1. `POST /app/subscriptions/checkout` crée un `Payment` PENDING et un lien
   de paiement Djomy à usage unique (15 min).
2. Djomy appelle `POST /api/v1/webhooks/djomy`. La signature
   `X-Webhook-Signature` est vérifiée et **le statut est toujours relu via
   l'API Djomy** avant d'activer quoi que ce soit (montant, devise et
   référence contrôlés).
3. Filet de sécurité : toutes les minutes, `reconcilePendingPayments`
   revérifie les paiements restés PENDING (webhook perdu) et expire les
   liens jamais payés.

Configuration (`.env`) : `DJOMY_BASE_URL`, `DJOMY_CLIENT_ID`,
`DJOMY_CLIENT_SECRET`, plus les options décrites dans `.env.example`.
L'URL du webhook `https://<domaine>/api/v1/webhooks/djomy` doit être
déclarée dans l'espace développeur Djomy. `SUBSCRIPTION_REQUIRED=false`
désactive l'obligation d'abonnement (utile pendant une transition).

## 📥 Import des sites Total (Book1.xlsx)

Les 16 sites du fichier `contexts/Book1.xlsx` sont figés dans
`prisma/data/book1-sites.json` et rattachés à la marque **TOTAL**.

```bash
npm run import:book1             # simulation, n'écrit rien
npm run import:book1 -- --apply  # écrit en base
```

L'import peut être rejoué sans créer de doublon : un site à moins de 100 m
d'une station existante est rattaché à celle-ci au lieu d'être recréé.

## 🔌 API

Toutes les routes sont préfixées par `/api/{API_VERSION}` (`v1` par défaut).

| Domaine | Préfixe | Auth |
|---|---|---|
| Auth chauffeur (OTP) | `/app/auth` | public / Bearer |
| Stations (recherche) | `/app/stations` | Bearer + abonnement actif |
| Abonnements | `/app/subscriptions` | public (formules) / Bearer (DRIVER) |
| Chat | `/app/chat` | Bearer (DRIVER) |
| Auth station | `/station/auth` | public / Bearer |
| Tableau de bord station | `/station/dashboard` | Bearer (STATION) |
| Auth admin | `/admin/auth` | public / Bearer |
| Comptes | `/admin/accounts` | Bearer (ADMIN) |
| Stations | `/admin/stations` | Bearer (ADMIN) |
| Catalogue (marques/zones) | `/admin/catalog` | Bearer (ADMIN) |
| Signalements | `/admin/reports` | Bearer (ADMIN) |
| Chat (supervision) | `/admin/chat` | Bearer (ADMIN) |
| Messagerie (SMS personnalisés) | `/admin/messages` | Bearer (ADMIN) |
| Abonnements & paiements | `/admin/subscriptions` | Bearer (ADMIN) |
| Webhook Djomy | `/webhooks/djomy` | signature HMAC (appelé par Djomy) |

La documentation interactive de l'API est servie sur `/api-docs` (Swagger UI).
`npm run docs:export` régénère `docs/openapi.json` à transmettre au frontend.
Les notes de version sont dans `docs/CHANGELOG-*.md`.

Un canal WebSocket (même port que le serveur HTTP) diffuse les messages de
chat en temps réel : le client envoie `{ threadId, accountId }` pour
s'initialiser, puis `{ text }` pour envoyer un message.
