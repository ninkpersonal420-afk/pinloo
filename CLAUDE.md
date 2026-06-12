# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Pinloo** is a Pinterest Pin Generator SaaS for affiliate marketers. Users enter a product, niche, and pain point, and the app uses the Anthropic Claude API to generate Pinterest pin titles, descriptions, hashtags, and strategy tips.

## Tech Stack

- **Frontend:** Vanilla JS/HTML/CSS — no framework, no build step
- **Backend:** Cloudflare Workers (serverless functions in `/functions/`)
- **Database:** Cloudflare D1 (SQLite) for subscribers, Cloudflare KV for user sessions/OTPs/pin count
- **Auth:** Email OTP via Resend (`noreply@getpinlo.com`)
- **Payments:** Stripe (subscriptions + webhooks)
- **AI:** Anthropic Claude API (`/v1/messages`)
- **Hosting:** Cloudflare Pages (primary), Netlify (fallback legacy functions in `/netlify/functions/`)

## Development Commands

There is no build step — the project is static HTML with embedded JS. To develop locally using Cloudflare's tooling:

```bash
# Install Wrangler CLI (Cloudflare Workers dev tool)
npm install -g wrangler

# Serve locally with Workers support
wrangler pages dev . --compatibility-date=2024-01-01

# Deploy functions to Cloudflare Pages
wrangler pages deploy .

# Tail live Worker logs
wrangler tail
```

There are no test suites, linters, or CI pipelines configured.

## Architecture

### Pages

- `index.html` — Marketing landing page (static)
- `app/index.html` — The full SPA (~3,100 lines of inline JS/CSS). All app logic lives here.
- `privacy.html`, `terms.html` — Static legal pages

### Serverless Functions (`/functions/`)

Each file is an independent Cloudflare Worker:

| File | Route | Purpose |
|---|---|---|
| `claude.js` | `POST /functions/claude` | Proxies to Anthropic API; enforces rate limits |
| `send-otp.js` | `POST /functions/send-otp` | Generates & emails a 6-digit OTP (10-min TTL in KV) |
| `verify-otp.js` | `POST /functions/verify-otp` | Validates OTP; creates/updates user record in KV |
| `check-pro.js` | `POST /functions/check-pro` | Queries D1 for Stripe subscription status |
| `pin-count.js` | `GET /functions/pin-count` | Returns global pin counter from KV |
| `stripe-webhook.js` | `POST /functions/stripe-webhook` | Handles Stripe events; syncs D1 subscribers table |
| `verify-stripe.js` | `POST /functions/verify-stripe` | Validates a Stripe checkout session |

### Data Layer

**Cloudflare KV (`PINLO_USERS` binding):**
- `${email}` → `{ email, usage, usagePeriod ("YYYY-MM"), isPro, stripeCustomerId, createdAt, lastUsedAt }`
- `otp:${email}` → `{ code, createdAt }` with 10-minute TTL
- `__global_pins__` → string integer, incremented on every generation

**Cloudflare D1 (`DB` binding) — `subscribers` table:**
```sql
email TEXT PRIMARY KEY,
stripe_customer_id TEXT,
stripe_subscription_id TEXT,
status TEXT,         -- active | trialing | past_due | canceled
plan TEXT,           -- monthly | annual | NULL
current_period_end INTEGER,  -- Unix seconds
created_at INTEGER,
updated_at INTEGER
```

### Authentication & Authorization Flow

1. User submits email → `send-otp` stores OTP in KV and sends email
2. User submits code → `verify-otp` validates and returns `{ isPro, usage, plan }`
3. Pro status is cached in `localStorage` (`pinlo_pro`, `pinlo_pro_expiry`)
4. `check-pro` can re-validate against D1 at any time (called on app load)
5. `claude.js` enforces the hard limit server-side: free users get 10 pins/month tracked in KV

### Rate Limiting Logic (in `claude.js`)

- Request types `autofill` and `niche-tip` do **not** count toward the monthly quota
- Free users: 10 generations/month, reset at calendar month boundary (`YYYY-MM`)
- Pro users: unlimited (status checked via D1 through `check-pro`)
- `admin@pinlo.internal` and any address in `ADMIN_EMAILS` bypass the free pin limit and quota tracking in `claude.js`

### Stripe Integration

- Plan detection in `verify-stripe.js`: amount ≤ $12.99 → `monthly`, higher → `annual`
- Webhook events handled: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Webhook signatures verified with HMAC-SHA256 using `STRIPE_WEBHOOK_SECRET`

### App SPA (`app/index.html`)

All logic is inline. Key `localStorage` keys:
- `pinlo_email`, `pinlo_pro`, `pinlo_pro_expiry`, `pinlo_pins_used`
- `pinlo_gate_hash` — SHA-256 hash of admin password (hidden admin panel)

Admin panel allows overriding pro status, pin count, and exporting all localStorage as JSON.

## Required Environment Variables (Cloudflare Workers secrets)

```
ANTHROPIC_API_KEY
RESEND_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
ADMIN_EMAILS          # optional, comma-separated; these emails bypass the free pin limit server-side (for owner/testing)
```

Plus Cloudflare bindings (configured in Cloudflare dashboard, not `.env`):
- `PINLO_USERS` — KV namespace
- `DB` — D1 database

## Key Conventions

- All emails are normalized with `.toLowerCase().trim()` before use as KV keys or D1 lookups
- All Worker functions respond with `Content-Type: application/json` and explicitly handle `OPTIONS` preflight for CORS
- KV operations in non-critical paths (e.g., incrementing global counter) fail silently to avoid blocking responses
- The Netlify functions in `/netlify/functions/` and `/api/` are legacy fallbacks — Cloudflare functions are the source of truth
