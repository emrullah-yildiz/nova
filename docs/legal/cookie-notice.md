# Cookie Notice

> **Version 1.0 · Effective June 4, 2026.** Prepared in good faith without a lawyer —
> not legal advice.

| | |
|---|---|
| **Version** | 1.0 |
| **Effective date** | June 4, 2026 |
| **Operator** | Nova (independent individual; no incorporated entity yet) |

Nova uses the **minimum** browser storage needed to sign you in and run the app. We do
**not** use advertising, analytics, or cross-site tracking cookies.

## 1. What we set
| Name | Type | Purpose | Lifetime |
|---|---|---|---|
| Session cookie | Strictly necessary | Keeps you signed in after authentication. `HttpOnly`, `Secure`, `SameSite=Lax` — not readable by JavaScript, sent only over HTTPS. | Until sign-out / expiry (or per "Remember me") |

We also use **browser `localStorage`/`sessionStorage`** (not cookies) for app
preferences and, briefly, for sign-in security values (a one-time nonce/state during
Google sign-in). Your "bring-your-own" AI key, if set, is held in `sessionStorage`
(cleared when the tab closes) or your encrypted server-side settings — not in a
long-lived cookie.

## 2. Consent
The session cookie is **strictly necessary** to provide a service you actively request
(signing in), so under the ePrivacy rules it does not require prior consent. Because we
set no analytics/advertising cookies, Nova does not show a cookie-consent banner. (If
analytics are ever added, a consent mechanism will be required first.)

## 3. Managing cookies
You can clear cookies/site data via your browser settings; doing so signs you out. The
app will not function as a signed-in experience without the session cookie.

## 4. Contact
nova.support@hi-nova.work
