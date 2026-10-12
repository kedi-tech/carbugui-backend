# Mise à jour API — 12/10/2026

Abonnements payants (Djomy), produits GAZ et LUBRIFIANT, import des sites Total.

La spec complète est dans [`openapi.json`](openapi.json) (Swagger UI sur `/api-docs`).
Les routes sont préfixées par `/api/v1`.

---

## ⚠️ Changements cassants pour l'app chauffeur

### 1. Consulter les stations nécessite un abonnement actif

| Route | Avant | Maintenant |
|---|---|---|
| `GET /app/stations` | public | **Bearer + abonnement** |
| `GET /app/stations/nearby` | Bearer optionnel | **Bearer + abonnement** |
| `GET /app/stations/{id}` | public | **Bearer + abonnement** |
| `POST /app/stations/{id}/reports` | Bearer | inchangé |

- Sans token, la réponse est `401`.
- Si le chauffeur n'a pas d'abonnement en cours, la réponse est **`402`** :

```json
{ "success": false, "code": "SUBSCRIPTION_REQUIRED", "message": "Abonnement requis. …" }
```

→ Sur un `402`, ouvrir l'écran d'abonnement.

Les comptes STATION et ADMIN ne sont pas concernés.

> Pendant la mise à jour de l'app, le backend peut tourner avec
> `SUBSCRIPTION_REQUIRED=false` : ces routes redeviennent alors publiques
> comme avant. `GET /app/subscriptions/me` renvoie `required: false` dans ce cas.

### 2. Nouveaux produits : `GAZ` et `LUBRIFIANT`

L'enum produit vaut maintenant `ESSENCE | GASOIL | GAZ | LUBRIFIANT` partout :

- `products[].product` des stations ;
- le filtre `?product=` de `/app/stations/nearby` ;
- `product` des signalements ;
- `PUT /station/dashboard/{stationId}/products/{product}`, où le tableau de bord station peut maintenant gérer la disponibilité et le prix du gaz et des lubrifiants.

Un produit inconnu renvoie `400`. Libellés suggérés : Essence, Gasoil, Gaz, Lubrifiant.

Pour `GAZ`, `priceGnf` est le prix de la bouteille. Pour `LUBRIFIANT`, c'est un prix indicatif.

---

## Abonnements

| Formule | `code` | Prix | Durée |
|---|---|---|---|
| 24 heures | `DAY` | 2 000 GNF | 24 h |
| 1 mois | `MONTH` | 10 000 GNF | 30 jours |

Les prix sont modifiables par un admin. Afficher toujours ceux que renvoie `GET /app/subscriptions/plans`, ne pas les coder en dur.

### Parcours de paiement

```
1. GET  /app/subscriptions/plans              → afficher les formules
2. POST /app/subscriptions/checkout           { "planCode": "DAY" | "MONTH" }
        ← data.id, data.paymentUrl, data.linkExpiresAt (15 min)
3. Ouvrir data.paymentUrl (navigateur / WebView) → paiement OM, MoMo, carte…
4. Au retour : GET /app/subscriptions/payments/{id} toutes les 3–5 s
        jusqu'à status ∈ SUCCEEDED | FAILED | CANCELED | EXPIRED
5. SUCCEEDED → GET /app/subscriptions/me (ou /app/auth/me) puis réessayer les stations
```

- Réappuyer sur « Payer » pendant qu'un lien est encore valide renvoie **le même lien** (`reused: true`) : on n'en crée pas un nouveau.
- Acheter alors qu'un abonnement est actif **prolonge** l'accès : la nouvelle période démarre à la fin de la précédente. `accessUntil` donne la date de fin réelle.
- Si le chauffeur ferme l'app avant la fin, rien n'est perdu : le serveur confirme le paiement tout seul (webhook Djomy, plus une revérification automatique chaque minute).

### Endpoints chauffeur

| Méthode | Route | Auth | Rôle |
|---|---|---|---|
| GET | `/app/subscriptions/plans` | public | Formules actives |
| GET | `/app/subscriptions/me` | Bearer (DRIVER) | État de l'abonnement |
| POST | `/app/subscriptions/checkout` | Bearer (DRIVER) | Génère le lien de paiement |
| GET | `/app/subscriptions/payments` | Bearer (DRIVER) | Historique (50 derniers) |
| GET | `/app/subscriptions/payments/{id}` | Bearer (DRIVER) | Statut d'un paiement (revérifié en direct s'il est PENDING) |

`GET /app/auth/me` contient aussi un champ `subscription`, au même format que `/app/subscriptions/me` :

```json
{
  "required": true,
  "active": true,
  "accessUntil": "2026-11-11T13:25:53.000Z",
  "current": { "id": "…", "planCode": "MONTH", "planLabel": "1 mois", "startsAt": "…", "endsAt": "…" },
  "upcomingCount": 0
}
```

Réponse de `POST /app/subscriptions/checkout` (`201`, ou `200` si le lien est réutilisé) :

```json
{
  "success": true,
  "reused": false,
  "data": {
    "id": "cm…",
    "status": "PENDING",
    "amountGnf": 2000,
    "merchantReference": "SUB-M2X7K9QF-3A1C",
    "paymentUrl": "https://sandbox.djomy.africa/p/32f4AS77",
    "linkExpiresAt": "2026-10-12T16:22:19.375Z",
    "plan": { "code": "DAY", "label": "24 heures" },
    "subscription": null
  }
}
```

Erreurs : `400` (planCode manquant), `404` (formule inconnue ou désactivée), `502` (Djomy a refusé ou ne répond pas), `503` (paiement non configuré côté serveur).

### Endpoints admin (back-office)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/admin/subscriptions?accountId=&active=true` | Périodes d'abonnement |
| GET | `/admin/subscriptions/plans` | Toutes les formules |
| PUT | `/admin/subscriptions/plans/{code}` | `{ label?, priceGnf?, isActive? }` |
| GET | `/admin/subscriptions/payments?status=&accountId=` | Paiements, avec frais et montant reçu |
| POST | `/admin/subscriptions/payments/{id}/reconcile` | Revérifier un paiement chez Djomy (client qui dit avoir payé) |

---

## Stations Total (Book1.xlsx)

16 sites Total sont ajoutés comme nouvelles stations, rattachées à la marque **TOTAL** (`brand.slug = "total"`) :

Coleah, Bellevue, Minière, Ratoma centre, Aéroport A&G, Kaporo, Nongo dem, Lambanyi, Tanerie Corniche, Enta, Tombolia A&G, Tombolia Entrée, Dabompa Tamisso, Cimenterie, Kabelen Dubreka, Siguiri Ville.

Pour les reconnaître dans l'app : `station.brand.slug === "total"`. Ces stations n'ont encore aucun produit renseigné : c'est la station qui les ajoutera depuis son tableau de bord.
