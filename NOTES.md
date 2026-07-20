# Working notes

_Last updated: 2026-06-29_

Scratchpad for picking work back up across machines. Newest at top.

## Session (2026-06-24 to 2026-06-29)

Product/quality pass on pin generation and the bulk-results view. All
committed to `main`, pushed. Latest commit: reduced-motion fix on landing
page (`5eb4312`).

### What changed
- **Multi-pin display overhaul** (`b084632`) — bulk-generated pins now each
  render as a self-contained card with their own SEO score (Pro: ring +
  breakdown + tip; free: locked teaser) and an A/B title picker, plus a
  results header showing average SEO and a "copy all pins" action.
- **Removed blanket `prefers-reduced-motion` suppression** in both the app
  (`b084632`) and landing page (`5eb4312`) — it was zeroing every animation
  duration and freezing the ticker/orbs/gradient/cards/spinner for anyone
  with OS reduce-motion on.
- **Smarter "Boost it" SEO tips** (`49831de`) — tips now cite the pin's
  actual char/tag counts and detected cliché instead of generic
  best-practice lines; high scorers get a "Looking strong" label; phrasing
  is seeded per-pin so it's stable on re-render but varies across a batch.
- **Fixed audience auto-fill race** (`d62bcb9`) — audience fill was on a
  fixed 900ms timer and could beat niche detection (Haiku), firing without
  niche context. Now driven by the niche-detection flow on every outcome
  (match/no-match/error), with the timer demoted to a 3500ms safety net.
- **New niche: Furniture & Office** (`c986b13`) — desks/office chairs/home
  office split out of Tech & Gadgets. Wired through pill row, `NICHE_DATA`,
  `NICHE_PILL_LABELS`, `NICHE_TIPS`, `STATIC_PAINS`, classifier scope rules,
  `NICHE_ALIASES`, landing page niche count (30→31), and
  `tools/pin-quality-test.mjs`. Also tightened the pin-generation prompt so
  copy reliably hits the SEO scorer's title/description length and
  problem→outcome phrasing criteria.

### Possible next steps / open threads
- Carried over from last session, still open:
  - Decide whether hero hashtag pills should show on <1440px screens.
  - Monthly free-pin reset is calendar-month/UTC, resets lazily on next
    action — no cron. Confirm that's acceptable long term.
  - Optional: open footer Support link in a new tab.

---

## Session (2026-06-11)

Big visual + product pass on the landing page, app, and legal pages. All
committed and pushed to `main`. Latest commit: header redesign (`aa887f5`).

### What changed
- **Landing page redesign** (`index.html`) — warm red-orange brand palette,
  animated gradients/orbs, floating pin cards + hashtag pills, shimmer CTAs,
  count-up stats, staggered reveals. Ticker rewritten in plain language.
- **Pricing section** rebuilt — gradient-ring Pro card, benefit-led feature
  list, annual per-month equivalent pill, trust footnote.
- **Feature grid** — replaced "No. 0X" labels with line-icons (fill with
  gradient on hover).
- **Free tier: 5 lifetime → 10 pins per calendar month**, with automatic
  monthly reset. Backend: `functions/claude.js`, `functions/verify-otp.js`.
  Client gate + copy: `app/index.html`. Also `terms.html`.
- **New logos** — `logo.png` (full app icon, transparent cutouts) and
  `logo-mark.png` (icon-only, used in both headers).
- **Headers redesigned** on landing + app to share the icon mark, wordmark,
  and uppercase tagline.
- **Navigation** — signed-in users go straight to `/app`; in-app logo and
  account-menu "Back to homepage" use `/?home` to reach the landing page.
- **Admin Pro fix** — admin override no longer desyncs from a Stripe
  cancellation (clears `pinlo_pro_cache`).
- **Legal pages** — real logo instead of pin emoji; rewrote AI-sounding
  summary boxes; footer Support now opens the in-app Support tab
  (`/app?tab=support`).

### Possible next steps / open threads
- Decide whether the hero hashtag pills should still show on <1440px screens
  (currently hidden to avoid overlapping text).
- Consider whether bulk generation should ever exceed 10 (decided: keep 10).
- The monthly free-pin reset is calendar-month/UTC based and resets lazily on
  next action — no cron. Confirm that's acceptable long term.
- Optional: open footer Support link in a new tab so readers don't lose the
  legal page they were on.

---

<!-- Add new session notes above this line -->
