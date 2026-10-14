# Réponse aux demandes du back-office — accès station

Pour : back-office administrateur (`sonap/`) · Réponse à la demande du 13/10/2026

La spec à jour est dans [`openapi.json`](openapi.json). Toutes les routes sont préfixées par `/api/v1`.

Les cinq demandes sont traitées. Les Demandes 1 et 3 sont livrées ensemble, et on peut maintenant créer des accès nommés, les supprimer et les recréer.

---

## Demande 1 — Plusieurs accès nommés par station ✅

`POST /admin/stations/{id}/accounts`

```json
{ "fullName": "Mamadou Diallo", "phoneNumber": "622111222" }
```

| Règle | Comportement |
|---|---|
| `fullName` | obligatoire, 3 caractères minimum, sinon `400` |
| `phoneNumber` | facultatif, normalisé en `+224XXXXXXXXX` ; `400` s'il est invalide ; `409` s'il est utilisé par un compte non supprimé |
| `loginCode` | `<slug>` pour le premier compte, puis `<slug>-2`, `<slug>-3`… Un code libéré par une suppression est réutilisé. |
| `membershipRole` | `OWNER` si la station n'a aucun autre agent actif, sinon `STAFF` |
| mot de passe | 8 caractères générés par le serveur : lettres et chiffres, sans `0 O 1 l I` pour pouvoir le dicter au téléphone. Renvoyé **une seule fois**. |

Réponse `201` : exactement le format demandé (`accountId`, `loginCode`, `password`, `fullName`, `phoneNumber`, `membershipRole`). Le compte est créé `ACTIVE`.

Toutes les erreurs ont un `message`, y compris le `409`.

## Demande 2 — Lister les accès d'une station ✅

`GET /admin/stations/{id}/accounts`, avec `?includeDeleted=true` pour voir aussi les comptes `DELETED`.

Le format est celui demandé : `id`, `fullName`, `phoneNumber`, `loginCode`, `status`, `membershipRole`, `lastSeenAt`, `createdAt`. Les agents sont triés par date de rattachement. `404` si la station est inconnue.

Le complément est fait aussi : dans `GET /admin/accounts`, chaque compte `STATION` porte maintenant
`stations: [{ id, name, slug, membershipRole }]`. Plus besoin de comparer `loginCode` et `slug`.

## Demande 3 — Vraie suppression d'un accès station ✅

`DELETE /admin/accounts/{id}`

- Réservé aux comptes `STATION`. Pour un chauffeur ou un admin, la réponse est `400` avec un message qui renvoie vers `PUT …/status`.
- Supprime le compte, ses `StationMembership` et ses `Session`. Le `loginCode` et le `phoneNumber` sont libérés.
- Les `StationActivity` et `StationReport` restent, avec `accountId` à `null`. C'est vérifié sur une vraie base MySQL.
- L'agent est déconnecté immédiatement : son token en cours est refusé (`401`).
- Réponse `200 { "success": true, "message": "Accès station supprimé." }` ; `404` si le compte est inconnu.

En plus, `PUT /admin/accounts/{id}/status` avec `DELETED` sur un compte `STATION` libère aussi le code et le numéro (ils passent à `null`) et déconnecte le compte. Les anciennes suppressions logiques ne bloquent donc plus rien. Un numéro encore porté par un compte `DELETED` d'avant cette version est récupéré automatiquement.

## Demande 4 — Réinitialiser le mot de passe d'un agent ✅

`POST /admin/accounts/{id}/password` (sans corps)

```json
{ "success": true, "data": { "accountId": "cm…", "loginCode": "sonap-517108-2", "password": "R4tq8NwZ" } }
```

- `400` si ce n'est pas un compte `STATION` (ou si l'accès a été supprimé) ; `404` si le compte est inconnu.
- **Déconnexion immédiate.** Les tokens d'accès durent 7 jours. Révoquer les sessions ne suffisait donc pas : un agent pouvait rester connecté jusqu'à une semaine. Le serveur refuse maintenant tout token émis avant la réinitialisation. C'est vrai aussi pour une suspension ou une suppression.

## Demande 5 — Règle du `409` à l'inscription station ✅

`POST /station/auth/register` :

- **Avant** : un seul compte par station. Le code de connexion était le slug, donc toute deuxième demande recevait `409 « Une demande existe déjà pour cette station »`.
- **Maintenant** : plusieurs agents peuvent s'inscrire pour la même station (codes `slug`, `slug-2`…). La seule règle d'unicité est **une demande ou un compte par numéro** : `409 « Ce numéro est déjà associé à un compte existant. »`.
- Garde-fou contre les abus : 5 demandes `PENDING` au plus par station. Au-delà, la réponse est `429` jusqu'à ce qu'un admin les traite.

---

## Corrections de la documentation

1. **`POST /admin/accounts/admins`** : cette route **n'a jamais existé** dans le backend (rien dans tout l'historique). Les appels « Nouvel administrateur » recevaient donc un `404`. Elle est maintenant implémentée :
   `{ fullName, phoneNumber, password? }`. Sans `password`, le serveur en génère un, renvoyé une seule fois dans `data.password`. `409` si le numéro est déjà pris.
2. **`GET /admin/subscriptions/payments`** et **`GET /admin/subscriptions`** ont maintenant un schéma exact (`AdminPayment`, `AdminSubscription`) :
   - `fees` et `receivedAmount` sont des **entiers en GNF**, `null` tant que le paiement n'est pas confirmé ;
   - `account` = `{ id, fullName, phoneNumber }` ;
   - `plan` = la formule complète ;
   - `subscription` = la période accordée, ou `null`.
3. **`POST /admin/subscriptions/payments/{id}/reconcile`** : `outcome` est **à la racine**, et le paiement à jour (format `AdminPayment`) est dans **`data`**. Valeurs possibles d'`outcome` :

   | `outcome` | Sens |
   |---|---|
   | `granted` | paiement confirmé, abonnement activé maintenant |
   | `already_processed` | déjà payé et activé |
   | `pending` | toujours en attente chez Djomy |
   | `expired` | lien expiré sans paiement |
   | `failed` / `canceled` | refusé / annulé chez Djomy |
   | `amount_mismatch` | montant ou devise incorrects : paiement `FAILED`, pas d'accès |
   | `reference_mismatch` | la transaction ne correspond pas à ce paiement |
   | `not_found` | transaction inconnue chez Djomy |
   | `nothing_to_check` | paiement non `PENDING` sans transaction : rien à revérifier |

Autre changement transverse : les erreurs génériques renvoient maintenant `message`, comme toutes les autres, en plus de l'ancien champ `error`.
