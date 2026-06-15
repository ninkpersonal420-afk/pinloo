# Pinlo — Pinterest Pin Generator

AI-powered Pinterest pin copy (titles, descriptions, hashtags) for affiliate marketers.
Static front-end + Cloudflare Pages Functions, email-OTP auth, Stripe subscriptions,
Anthropic Claude for generation.

## Structure

```
index.html          Landing page
app/index.html      The app (single-page)
privacy.html        Privacy policy
terms.html          Terms & conditions
404.html            Not-found page
_headers            Security headers (CSP, X-Frame-Options, HSTS, …)
robots.txt          / sitemap.xml — SEO
functions/
  claude.js         Anthropic proxy (auth + usage + rate limiting + model/token caps)
  send-otp.js       Emails a login code (Resend) — rate limited
  verify-otp.js     Verifies the code, issues a signed session token
  check-pro.js      Reads Pro status from D1 (source of truth)
  verify-stripe.js  Confirms a Stripe checkout session on redirect-back
  stripe-webhook.js Keeps the D1 subscribers table in sync with Stripe
  pin-count.js      Public "pins generated" counter
```

## Cloudflare bindings (required)

| Binding            | Type            | Used by |
|--------------------|-----------------|---------|
| `PINLO_USERS`      | KV namespace    | usage counts, OTP codes, rate-limit buckets |
| `DB`               | D1 database     | `subscribers` table (Pro entitlement) |
| `ANTHROPIC_API_KEY`| Secret          | Claude API |
| `RESEND_API_KEY`   | Secret          | OTP emails |
| `STRIPE_SECRET_KEY`| Secret          | verify checkout sessions |
| `STRIPE_WEBHOOK_SECRET` | Secret     | verify webhook signatures |
| `SESSION_SECRET`   | Secret (optional) | signs login session tokens (falls back to `ANTHROPIC_API_KEY` if unset) |

### D1 schema

```sql
CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT,                 -- active | trialing | past_due | canceled
  plan TEXT,                   -- monthly | annual
  current_period_end INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);
```

## Security model (post-hardening)

- **Generation requires a signed session token** issued by `/verify-otp` (HMAC-SHA256).
  `/claude` derives the user's email from the token — the client cannot assert an
  arbitrary email, "admin", or Pro status.
- **The server chooses the model and `max_tokens`.** Client values are ignored.
- **Pro is read from D1** (written by the Stripe webhook), not from localStorage.
- **Autofill / niche-tip** stay open (they run before sign-in) but are hard-capped on
  model + tokens, input-clamped, and rate-limited per IP — not a general LLM proxy.
- **CORS** is scoped to the deployment origin.
- **OTP** is crypto-random, single-use, 10-min TTL, 5-attempt lockout; `/send-otp` is
  resend-throttled and rate-limited per email + per IP.

## Launch checklist — config that lives OUTSIDE this repo

These must be set in the respective dashboards before launch:

1. **Stripe Payment Links → "After payment" redirect.** Payment Links ignore a
   `success_url` query param. In the Stripe dashboard, for BOTH the monthly and annual
   payment links, set the confirmation redirect to:
   `https://getpinlo.com/app?session_id={CHECKOUT_SESSION_ID}`
   (Without this, Pro still activates on the user's next app load via `/check-pro`, but
   the instant post-checkout activation won't fire.)
2. **Stripe webhook** pointed at `https://getpinlo.com/stripe-webhook`, subscribed to:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. **Stripe Billing Portal** enabled (the in-app "Manage subscription" links to it).
4. **Resend**: verify the `getpinlo.com` sending domain (SPF/DKIM) so OTP emails from
   `noreply@getpinlo.com` deliver.
5. **Domain**: confirm `getpinlo.com` is the live domain (logo, OTP email links, OG
   image, and canonical all point to it).
6. **Optional**: set `SESSION_SECRET` to a long random string (otherwise the Anthropic
   key is used as the HMAC secret — fine, but a dedicated secret lets you rotate auth
   without rotating the API key).

## Not yet wired (recommended before/just after launch)

- Analytics (e.g. Cloudflare Web Analytics — privacy-friendly, no cookie banner needed).
- Error monitoring (e.g. Sentry).

## Local dev

```
npx wrangler pages dev .
```
Provide the bindings/secrets above via `.dev.vars` and `wrangler` flags.
