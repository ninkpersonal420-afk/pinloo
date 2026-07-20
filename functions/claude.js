import { verifySession } from './_session.js';

export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  try {
    const body = await context.request.json();
    const ANTHROPIC_API_KEY = context.env.ANTHROPIC_API_KEY;
    const KV = context.env.PINLO_USERS;
    const DB = context.env.DB;
    const SESSION_SECRET = context.env.SESSION_SECRET;

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500, headers: corsHeaders });
    }
    if (!KV) {
      return new Response(JSON.stringify({ error: 'KV not configured' }), { status: 500, headers: corsHeaders });
    }

    const { email, type, system, messages, token } = body;

    // Model and token limits are set server-side — never read from client.
    // Cheap, simple helpers (autofill, niche-tip) stay on Haiku; the actual pin
    // generation uses Sonnet — measurably higher copy quality (named-product
    // titles, clean grammar, relevant hashtags) for ~1 cent per pin.
    const isHelper = type === 'autofill' || type === 'niche-tip';
    const MODEL = isHelper ? 'claude-haiku-4-5' : 'claude-sonnet-4-6';
    const MAX_TOKENS = type === 'autofill' ? 150 : type === 'niche-tip' ? 150 : 900;

    // Valid email required for all request types
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Valid email required' }), { status: 400, headers: corsHeaders });
    }
    let emailKey = email.toLowerCase().trim();

    // Session auth for the PAID generation path. When SESSION_SECRET is set, a
    // valid token from verify-otp is required and its email — not the client's
    // claimed one — is the authoritative identity, so nobody can spend on
    // someone else's quota or forge admin/Pro by typing an address. Helper
    // requests (autofill/niche-tip) keep their own lighter controls below so
    // pre-sign-in autofill still works. If SESSION_SECRET is unset, fall back to
    // the legacy email-trust behaviour (still IP-capped) so the app never hard
    // breaks before the secret is configured.
    if (!isHelper && SESSION_SECRET) {
      const session = token ? await verifySession(token, SESSION_SECRET) : null;
      if (!session) {
        return new Response(JSON.stringify({
          error: 'invalid_session',
          message: 'Your session has expired. Please sign in again.'
        }), { status: 401, headers: corsHeaders });
      }
      emailKey = session.email;
    }

    // Admin allowlist — bypasses the free quota for owner/testing accounts.
    // Set ADMIN_EMAILS in Cloudflare (comma-separated). There is deliberately
    // NO hardcoded default: a fixed backdoor address would let anyone who reads
    // the source grant themselves unlimited generation on the owner's API bill.
    const ADMIN_EMAILS = (context.env.ADMIN_EMAILS || '')
      .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const isAdmin = ADMIN_EMAILS.includes(emailKey);

    // Autofill and niche-tip: verify email is known, no quota deduction, soft daily cap
    if (type === 'autofill' || type === 'niche-tip') {
      const isInternalEmail = emailKey === 'autofill@pinlo.internal';
      if (!isInternalEmail) {
        const stored = await KV.get(emailKey);
        if (!stored) {
          return new Response(JSON.stringify({ error: 'Unrecognized email' }), { status: 403, headers: corsHeaders });
        }
      }

      const today = new Date().toISOString().slice(0, 10);

      // Per-IP daily cap on helpers. The email cap alone doesn't bound the
      // anonymous 'autofill@pinlo.internal' path or stop someone forcing cheap
      // Haiku calls by tagging generation content as type:'autofill', so also
      // limit per originating network.
      try {
        const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
        const ipKey = `hlpip:${ip}:${today}`;
        const ipCur = parseInt(await KV.get(ipKey) || '0');
        if (ipCur >= 300) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: corsHeaders });
        }
        await KV.put(ipKey, String(ipCur + 1), { expirationTtl: 86400 });
      } catch (_) { /* non-critical */ }

      // Soft cap: 200 autofill/niche-tip requests per email per day
      try {
        const ratKey = `ar:${emailKey}:${today}`;
        const cur = parseInt(await KV.get(ratKey) || '0');
        if (cur >= 200) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: corsHeaders });
        }
        await KV.put(ratKey, String(cur + 1), { expirationTtl: 86400 });
      } catch (_) { /* non-critical */ }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages })
      });
      const data = await response.json();
      return new Response(JSON.stringify(data), { status: response.status, headers: corsHeaders });
    }

    // --- Generation requests ---
    const FREE_LIMIT = 10;
    const currentPeriod = new Date().toISOString().slice(0, 7); // "YYYY-MM"

    let user = null;
    const stored = await KV.get(emailKey);
    if (stored) {
      user = JSON.parse(stored);
      if (user.usagePeriod !== currentPeriod) {
        user.usage = 0;
        user.usagePeriod = currentPeriod;
      }
    } else {
      user = {
        email: emailKey,
        usage: 0,
        usagePeriod: currentPeriod,
        isPro: false,
        stripeCustomerId: null,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString()
      };
    }

    // Pro status from D1 — single source of truth, ignores stale KV isPro field.
    // Admin accounts are treated as Pro without a subscriber row.
    let isPro = isAdmin;
    if (!isAdmin && DB) {
      try {
        const row = await DB.prepare(
          `SELECT status, current_period_end FROM subscribers WHERE email = ?`
        ).bind(emailKey).first();
        if (row) {
          const now = Math.floor(Date.now() / 1000);
          isPro = row.status === 'active' || row.status === 'trialing' ||
                  (row.status === 'past_due' && row.current_period_end && row.current_period_end > now);
        }
      } catch (_) {
        // D1 unavailable — degrade to KV cache rather than blocking the request
        isPro = user.isPro || false;
      }
    }

    // Abuse guard: the endpoint trusts a self-asserted email, so a script could
    // rotate throwaway addresses to get 10 free Sonnet pins each and drain the
    // API budget. Cap non-Pro generations per originating IP per day. Pro and
    // admin traffic is exempt (a power user legitimately runs many bulk jobs).
    if (!isPro && !isAdmin) {
      try {
        const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
        const today = new Date().toISOString().slice(0, 10);
        const ipKey = `genip:${ip}:${today}`;
        const ipCount = parseInt(await KV.get(ipKey) || '0');
        if (ipCount >= 40) {
          return new Response(JSON.stringify({
            error: 'ip_rate_limited',
            message: 'Daily free generation limit reached for this network. Please try again tomorrow or upgrade to Pro.'
          }), { status: 429, headers: corsHeaders });
        }
        await KV.put(ipKey, String(ipCount + 1), { expirationTtl: 86400 });
      } catch (_) { /* non-critical: never block a real request on the guard */ }
    }

    if (!isPro && user.usage >= FREE_LIMIT) {
      return new Response(JSON.stringify({
        error: 'free_limit_reached',
        message: `You have used all ${FREE_LIMIT} free pins for this month. Upgrade to Pro for unlimited generation.`,
        usage: user.usage,
        isPro: false
      }), { status: 402, headers: corsHeaders });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages })
    });

    const data = await response.json();

    if (response.ok) {
      if (!isAdmin) {
        user.usage = (user.usage || 0) + 1;
        user.lastUsedAt = new Date().toISOString();
        try {
          await KV.put(emailKey, JSON.stringify(user));
        } catch (_) { /* non-critical */ }
      }

      try {
        const totalKey = '__global_pins__';
        const current = await KV.get(totalKey);
        await KV.put(totalKey, String((parseInt(current || '0') + 1)));
      } catch (_) {}
    }

    return new Response(JSON.stringify(data), { status: response.status, headers: corsHeaders });

  } catch (err) {
    console.error('claude.js error:', err);
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  });
}
