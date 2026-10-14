# Demandes d'évolution API — back-office (accès station)

Pour : l'équipe backend Carbugui · De : back-office administrateur (`sonap/`) · 13/10/2026

Référence : [`backend-docs/openapi.json`](backend-docs/openapi.json) (mise à jour du 12/10/2026). Toutes les routes sont préfixées par `/api/v1`.

## Le besoin

Depuis le back-office, un administrateur doit pouvoir :

1. créer **plusieurs accès** pour une même station, chacun **au nom d'une personne** ;
2. **supprimer** un accès, puis en recréer un pour la même station ;
3. **redonner un mot de passe** à un agent qui l'a perdu.

Aujourd'hui l'API ne permet aucun des trois. Le back-office contourne ce qu'il peut (il garde le nom et le mot de passe dans son propre stockage chiffré), mais les blocages ci-dessous ne peuvent être levés que côté serveur.

## Ce qui bloque aujourd'hui

| Constat | Effet |
|---|---|
| `POST /admin/stations/{id}/accounts` ne prend **aucun corps** et utilise le `slug` de la station comme `loginCode`. | Un seul accès par station. Le second appel répond `409` sans message. Impossible de nommer l'accès. |
| `Account.loginCode` et `Account.phoneNumber` sont `@unique`, et il n'existe pas de route de suppression. `PUT /admin/accounts/{id}/status` avec `DELETED` est une suppression logique. | Après « suppression », le code reste pris : `POST /admin/stations/{id}/accounts` répond toujours `409`. Le numéro reste pris lui aussi. |
| `POST /station/auth/register` répond `409 « Une demande existe déjà pour cette station »`. | On ne peut pas non plus passer par l'inscription pour ajouter un deuxième agent. |
| Pas de route admin pour lister les membres d'une station (`StationMembership`). | Le back-office devine le rattachement en comparant le `loginCode` au `slug`. |
| Pas de route admin pour réinitialiser un mot de passe. | Un agent qui oublie son mot de passe ne peut pas être dépanné. |

---

## Demande 1 — Plusieurs accès nommés par station *(prioritaire)*

`POST /admin/stations/{id}/accounts` accepte désormais un corps :

```json
{ "fullName": "Mamadou Diallo", "phoneNumber": "622111222" }
```

| Champ | Règle |
|---|---|
| `fullName` | **obligatoire**, 3 caractères minimum |
| `phoneNumber` | facultatif ; même normalisation que partout ailleurs (`+224` + 9 chiffres) ; `409` s'il est déjà utilisé par un compte non supprimé |

Comportement :

- Chaque appel crée **un nouveau compte** `STATION`, `ACTIVE`, et une `StationMembership` (`role: STAFF`, ou `OWNER` pour le premier compte de la station).
- `loginCode` unique par compte : le `slug` pour le premier compte, puis `slug-2`, `slug-3`… (ou un suffixe aléatoire court : le format exact importe peu tant qu'il reste lisible au téléphone).
- Mot de passe toujours généré par le serveur et renvoyé une seule fois, comme aujourd'hui.

Réponse `201` :

```json
{
  "success": true,
  "data": {
    "accountId": "cm…",
    "loginCode": "total-kaloum-2",
    "password": "x7Kp9mQa",
    "fullName": "Mamadou Diallo",
    "phoneNumber": "+224622111222",
    "membershipRole": "STAFF"
  }
}
```

Erreurs : `400` (nom manquant ou trop court, numéro invalide), `404` (station inconnue), `409` (numéro déjà utilisé), **avec un `message`**. Le `409` actuel n'a pas de corps.

## Demande 2 — Lister les accès d'une station

```
GET /admin/stations/{id}/accounts
```

Réponse `200` : les comptes rattachés à la station via `StationMembership`, statut `DELETED` exclu par défaut (`?includeDeleted=true` pour les voir).

```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": "cm…",
      "fullName": "Mamadou Diallo",
      "phoneNumber": "+224622111222",
      "loginCode": "total-kaloum-2",
      "status": "ACTIVE",
      "membershipRole": "STAFF",
      "lastSeenAt": "2026-10-13T09:12:00.000Z",
      "createdAt": "2026-10-13T08:00:00.000Z"
    }
  ]
}
```

En complément, ajouter le rattachement dans `GET /admin/accounts` (`stations: [{ id, name, slug, membershipRole }]` sur les comptes `STATION`) nous permettrait de supprimer la déduction par `loginCode`.

## Demande 3 — Vraie suppression d'un accès station

```
DELETE /admin/accounts/{id}
```

- Réservé aux comptes `STATION` (`400` pour un conducteur ou un admin : leur historique de paiements, de signalements et de chat doit rester).
- Supprime le compte et ses `StationMembership`, révoque ses `Session`, et **libère son `loginCode` et son `phoneNumber`**.
- Les `StationActivity` et `StationReport` qu'il a produits restent, avec `accountId` à `null` : l'historique de la station ne doit pas perdre de lignes.
- Réponse `200 { "success": true }` ; `404` si le compte n'existe pas.

**Alternative acceptable** si une suppression physique pose problème : garder `PUT /admin/accounts/{id}/status` avec `DELETED`, mais à ce moment-là mettre `loginCode` et `phoneNumber` à `null` (ou les suffixer, par ex. `…#deleted-<id>`) et révoquer les sessions. L'important est qu'après suppression, la Demande 1 puisse recréer un accès pour la même station et le même numéro.

## Demande 4 — Réinitialiser le mot de passe d'un agent

```
POST /admin/accounts/{id}/password
```

- Réservé aux comptes `STATION`.
- Génère un nouveau mot de passe, révoque les sessions en cours du compte, renvoie le mot de passe **une seule fois** :

```json
{ "success": true, "data": { "accountId": "cm…", "loginCode": "total-kaloum-2", "password": "R4tq8NwZ" } }
```

- `404` si le compte n'existe pas, `400` si ce n'est pas un compte `STATION`.

## Demande 5 — Clarifier le `409` de l'inscription station

`POST /station/auth/register` répond `409 « Une demande existe déjà pour cette station »`. Merci de préciser la règle (une demande `PENDING` par station ? un compte par station ?) et, si possible, de la limiter à « une demande `PENDING` par **numéro** » : plusieurs agents d'une même station doivent pouvoir s'inscrire depuis l'application.

---

## Corrections de la documentation (sans changement de code)

1. **`POST /admin/accounts/admins`** a disparu de `openapi.json` du 12/10, alors que le back-office l'utilise (Comptes → *Nouvel administrateur*). Route supprimée, ou oubli de la spec ?
2. **`GET /admin/subscriptions/payments`** et **`GET /admin/subscriptions`** : la spec dit « tous les champs, dont `transactionId`, `fees`, `receivedAmount`… avec compte », sans schéma. Merci de donner le schéma exact, en particulier le nom et le type de `fees` et `receivedAmount`, et la forme de `account` (`{ id, fullName, phoneNumber }` ?).
3. **`POST /admin/subscriptions/payments/{id}/reconcile`** : préciser où se trouvent `outcome` et le paiement à jour dans la réponse (racine, ou dans `data` ?), et la liste complète des valeurs d'`outcome`.

## Ordre souhaité

1. Demandes 1 et 3 : ensemble, elles débloquent « plusieurs accès nommés, supprimables et recréables ».
2. Demande 4.
3. Demande 2 et les corrections de la documentation.
4. Demande 5.

Dès que les Demandes 1 et 3 sont en ligne, le back-office enverra le nom directement à l'API et réaffichera le bouton de création après une suppression. Merci de mettre à jour `openapi.json` en même temps.
