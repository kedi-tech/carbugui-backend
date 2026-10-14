# Mise à jour API — 14/10/2026

Paiement iPhone : le pass s'achète sur une page web, en dehors de l'app.

Ce document répond à `ios-payments.md`. La spec complète est dans [`openapi.json`](openapi.json).

Page de paiement : **https://carbugui.kedi-tech.com/pass**

---

## Nouveau : `POST /app/subscriptions/pass-link` ✅

C'est la route du bouton « Recevoir mes informations par SMS ». Elle est conforme à la spec de `ios-payments.md`.

```http
POST /api/v1/app/subscriptions/pass-link
Authorization: Bearer <token chauffeur>
```

Pas de corps. Le SMS « Activez votre pass CARBUGUI : https://carbugui.kedi-tech.com/pass » part au **numéro du compte**.

| Statut | Quand | Corps |
|---|---|---|
| `200` | SMS envoyé | `{ "success": true }` |
| `400` | compte sans numéro | `{ "success": false, "message": "Aucun numéro de téléphone sur ce compte." }` |
| `401` | token absent, invalide ou expiré | habituel |
| `403` | compte non DRIVER | habituel |
| `429` | moins de 2 min depuis le dernier SMS | `message` : « Un SMS vient d'être envoyé. Réessayez dans quelques minutes. » |
| `429` | déjà 5 SMS sur les dernières 24 h | `message` : « Vous avez atteint la limite de SMS pour aujourd'hui. Réessayez demain. » |
| `503` | `PUBLIC_BASE_URL` absent, ou fournisseur SMS en panne | `{ "success": false, "message": "…" }` |

- La limite est comptée **par compte**, sur 24 h glissantes et non par jour calendaire.
- Un envoi échoué (`503`) ne compte pas : le chauffeur peut réessayer tout de suite.
- Plusieurs appuis simultanés n'envoient qu'un seul SMS.
- Afficher le `message` du `429` tel quel.

---

## Ce que l'app doit faire

| | iPhone | Android |
|---|---|---|
| Affichage du pass | « Votre pass » : actif jusqu'au …, ou « Aucun pass actif ». Bouton « Actualiser ». | inchangé |
| Prix, « Payer », lien vers le paiement | **aucun** | inchangé : « Payer » ouvre Djomy dans le navigateur |
| Vérification du pass | `GET /app/subscriptions/me` (ou `GET /app/auth/me`) toutes les 5 min, à la réouverture et sur « Actualiser » | inchangé |
| `POST /app/auth/otp/verify` | **envoyer `platform: "IOS"`** | envoyer `platform: "ANDROID"` |

`platform: "IOS"` est indispensable : c'est lui qui déclenche, à la création du compte, le SMS contenant le lien d'achat (voir plus bas).

Les stations restent fermées sans pass : `402 SUBSCRIPTION_REQUIRED`. Sur iPhone, afficher alors « Aucun pass actif » **sans** proposer de payer.

---

## La page web `/pass`

Adresse : `https://<domaine>/pass`. Elle est servie par le backend, à la racine du serveur (pas sous `/api/v1`).

1. Le chauffeur saisit son numéro et reçoit le code SMS habituel (`/app/auth/otp/request`).
2. Il valide le code (`/app/auth/otp/verify`, `platform: "WEB"`).
3. Il voit son pass actuel et choisit une formule : prix réels issus de `GET /app/subscriptions/plans`.
4. `POST /app/subscriptions/checkout`, puis la page Djomy (Orange Money, MoMo, carte).
5. Retour sur `https://<domaine>/pass/merci`, qui suit le paiement jusqu'au bout : « **Votre pass est actif.** Pass … jusqu'au …. Retournez dans l'application CARBUGUI. »

Aucune nouvelle logique de paiement : c'est le même checkout que sur Android.

**Retour de paiement Android** : la page de retour Djomy est maintenant `/pass/merci` pour tout le monde. Un chauffeur Android qui a payé depuis l'app atterrit donc dans son navigateur sur « Paiement reçu, merci ! … Retournez dans l'application CARBUGUI. » L'app voit le pass à sa prochaine vérification.

---

## SMS envoyés par le serveur

| Quand | Texte |
|---|---|
| Compte créé depuis l'app iPhone (`platform: "IOS"`) | « Activez votre pass CARBUGUI : https://<domaine>/pass » |
| Paiement confirmé (tous les canaux) | « Carbugui : paiement de 2 000 GNF reçu, merci ! Abonnement 24 heures actif jusqu'au … Réf : … » |
| Dernière période terminée, sans relais | « CARBUGUI : votre pass a expiré. Renouvelez-le ici : https://<domaine>/pass » |

Le SMS d'expiration est envoyé une seule fois. Il n'est pas envoyé si un pass acheté d'avance prend le relais. On peut le couper avec `SUBSCRIPTION_EXPIRY_SMS=false`.

---

## App Review (Apple)

1. Dans `.env` du serveur, fixer `REVIEW_PHONE_NUMBER=+224…` (un numéro dédié) et `REVIEW_OTP_CODE=` suivi d'un code à 6 chiffres. Ce numéro reçoit toujours ce code, **sans SMS**. Tout autre numéro continue de recevoir un vrai code.
2. Lui offrir un pass actif depuis le back-office :

```http
POST /api/v1/admin/subscriptions/grant
Authorization: Bearer <token admin>

{ "phoneNumber": "+224…", "durationDays": 90, "note": "Compte de test App Review" }
```

   Le compte DRIVER est créé s'il n'existe pas.

3. Note de revue : « Le pass est acheté en dehors de l'application ; l'application ne vend rien et ne renvoie vers aucun paiement. »
4. Après la revue, vider `REVIEW_PHONE_NUMBER` et `REVIEW_OTP_CODE`.

`POST /admin/subscriptions/grant` sert aussi aux gestes commerciaux. La période créée a `paymentId: null`, `grantedById` (l'admin) et `note`.

---

## Configuration serveur

| Variable | Rôle |
|---|---|
| `PUBLIC_BASE_URL` | **Obligatoire** pour ce qui précède. URL publique **https** du serveur, ex. `https://api.carbugui.com`. Sans elle : pas de SMS de lien et pas de page de retour Djomy. |
| `SUBSCRIPTION_EXPIRY_SMS` | `true` par défaut |
| `REVIEW_PHONE_NUMBER`, `REVIEW_OTP_CODE` | Compte de test App Review, vides hors revue |

Migration : `20261014090000_pass_grants_expiry_sms` (`npx prisma migrate deploy`).
