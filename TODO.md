# Pinlo — Backlog / Future Ideas

## Cross-device sessions (noted 2026-07)
Login is currently per-browser: auth state lives in `localStorage`
(`pinlo_gate_email`, `pinlo_verified`, `pinlo_session`), so a user who signs up
on their phone is not automatically signed in on their laptop — they verify an
OTP once per browser/device. This is normal for OTP apps and fine for launch.

If we want true cross-device sessions later, options:
- Server-side session store: on OTP verify, create a session record in KV keyed
  by a random id; the client holds only the id. Same email on a new device can
  "resume" by re-verifying OTP (unavoidable without passwords) — but Pro status
  already follows the email via D1, so the main win would be syncing history.
- Sync pin history to the server (KV/D1) keyed by email instead of localStorage,
  so history appears on any device once the email is verified there.

Nothing is broken today — this is a growth/polish feature, not a bug.
