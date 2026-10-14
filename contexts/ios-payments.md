# iPhone payments: the Djomy web page, outside the app

**Payment page: https://carbugui.kedi-tech.com/pass** (served by the backend, see
`CHANGELOG-2026-10-14.md`)

Apple refuses prices, buy buttons and links in the app that lead to a payment other than Apple's
In-App Purchase (App Review Guidelines 3.1.1, 3.1.3). It does allow an app to unlock something
bought elsewhere.

So on iPhone:
- **The app sells nothing.** No price, no « Payer », no link, no domain name. The pass screen
  shows only « Votre pass » (active until …, or « Aucun pass actif ») and an « Actualiser »
  button. Without a pass, the stations answer `402` and the app shows « Aucun pass actif »
  without offering to pay. Switch: `SELLS_IN_APP` in `expo/constants/billing.ts`.
- **Drivers pay on the page above**, through Djomy: Orange Money, MoMo or card. They get its
  link **by SMS**, never from the app.
- The pass lands on their account, and the app shows it at its next check: every 5 minutes, on
  reopen, or with « Actualiser ».

Android: « Payer » opens Djomy in the phone's browser. After paying, Djomy now returns to
`/pass/merci` in the browser (« Paiement reçu, merci ! … »). The app checks the payment again as
soon as the driver switches back to it.

---

## What the app sends

`POST /app/auth/otp/verify` carries `platform: "IOS"` or `"ANDROID"` (`devicePlatform()` in
`expo/api/endpoints.ts`). **`IOS` is what makes the server send the payment-link SMS** when an
account is created. Don't change it.

## The payment page (backend)

1. The driver types their number and gets the usual SMS code.
2. They validate it (`otp/verify`, `platform: "WEB"`).
3. They see their pass and pick a plan, with prices from `GET /app/subscriptions/plans`.
4. `POST /app/subscriptions/checkout`, then the Djomy page.
5. Return to `/pass/merci`, which follows the payment to the end: « Votre pass est actif …
   Retournez dans l’application CARBUGUI. »

## SMS sent by the server

| When | Text |
|---|---|
| Account created from the iPhone app | « Activez votre pass CARBUGUI : https://<domain>/pass » |
| Payment confirmed (all channels) | « Carbugui : paiement de 2 000 GNF reçu, merci ! … Réf : … » |
| Last period ended, nothing bought in advance | « CARBUGUI : votre pass a expiré. Renouvelez-le ici : https://<domain>/pass » |

The expiry SMS is sent once. It can be turned off with `SUBSCRIPTION_EXPIRY_SMS=false`.
**The server's `PUBLIC_BASE_URL` must be set** (public https address). Without it there's no
link SMS and no Djomy return page.

## To build (backend): `POST /app/subscriptions/pass-link`

Texts the signed-in driver the link to the pass payment page. Used by the iPhone app's
« Recevoir mes informations par SMS » button, shown to a driver with no active pass.

**Request**

```http
POST /api/v1/app/subscriptions/pass-link
Authorization: Bearer <driver access token>
```

- No body. The SMS goes to the **account's own phone number**; the app can't choose the
  recipient.
- Driver accounts only (`role: DRIVER`).

**What it does**

1. Sends the same SMS as at iPhone sign-up:
   « Activez votre pass CARBUGUI : https://<PUBLIC_BASE_URL>/pass »
2. Applies the rate limit below before sending.

**Responses**

| Status | When | Body |
|---|---|---|
| `200` | SMS sent | `{ "success": true }` |
| `400` | Account has no phone number | `{ "success": false, "message": "…" }` |
| `401` | Missing, invalid or expired token | usual |
| `403` | Not a DRIVER account | usual |
| `429` | Rate limit reached | `{ "success": false, "message": "Un SMS vient d'être envoyé. Réessayez dans quelques minutes." }` |
| `503` | `PUBLIC_BASE_URL` not set, or SMS provider down | `{ "success": false, "message": "…" }` |

**Rate limit (required):** at most **1 SMS per account every 2 minutes**, and **5 per account
per day**.

**App side (done):** `requestPassInfoSms()` in `expo/api/endpoints.ts`, button in
`expo/app/abonnement.tsx`. Until the route is deployed the app gets `404` and shows « Cette
option n’est pas encore disponible ».

**Apple:** the app never shows the link, a price, « payer » or « acheter ». The button text
stays neutral (« informations »). It's still a review risk, since the SMS leads to an outside
payment. If Apple rejects the app for it, remove the `pass.status === "none"` block in
`expo/app/abonnement.tsx`. The SMS at sign-up and at expiry keep working without it.

## App Review (Apple)

1. In the server's `.env`: `REVIEW_PHONE_NUMBER=+224…` and `REVIEW_OTP_CODE=<6 digits>`. That
   number always gets that code, with no SMS.
2. Give it an active pass from the back-office:
   `POST /api/v1/admin/subscriptions/grant` `{ "phoneNumber": "+224…", "durationDays": 90, "note": "Compte de test App Review" }`.
   The DRIVER account is created if it doesn't exist.
3. Put the number and code in App Store Connect → App Review Information, with the note:
   « Le pass est acheté en dehors de l’application ; l’application ne vend rien et ne renvoie
   vers aucun paiement. »
4. After the review, empty `REVIEW_PHONE_NUMBER` and `REVIEW_OTP_CODE`.

## Retired: `ios-payment/` (Vercel)

The Next.js page at https://carburgi-payment-one.vercel.app did the same job. It's no longer
used, because the SMS messages and Djomy's return point to the backend's `/pass`. The Vercel
project can be deleted. The code stays in `ios-payment/` for reference.
