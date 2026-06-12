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

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500, headers: corsHeaders });
    }
    if (!KV) {
      return new Response(JSON.stringify({ error: 'KV not configured' }), { status: 500, headers: corsHeaders });
    }

    const { email, type, system, messages } = body;

    // Model and token limits are set server-side — never read from client
    const MODEL = 'claude-haiku-4-5';
    const MAX_TOKENS = type === 'autofill' ? 80 : type === 'niche-tip' ? 150 : 900;

    // Valid email required for all request types
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Valid email required' }), { status: 400, headers: corsHeaders });
    }
    const emailKey = email.toLowerCase().trim();

    // Autofill and niche-tip: verify email is known, no quota deduction, soft daily cap
    if (type === 'autofill' || type === 'niche-tip') {
      const isInternalEmail = emailKey === 'autofill@pinlo.internal';
      if (!isInternalEmail) {
        const stored = await KV.get(emailKey);
        if (!stored) {
          return new Response(JSON.stringify({ error: 'Unrecognized email' }), { status: 403, headers: corsHeaders });
        }
      }

      // Soft cap: 200 autofill/niche-tip requests per email per day
      try {
        const today = new Date().toISOString().slice(0, 10);
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

    // Pro status from D1 — single source of truth, ignores stale KV isPro field
    let isPro = false;
    if (DB) {
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
      user.usage = (user.usage || 0) + 1;
      user.lastUsedAt = new Date().toISOString();
      try {
        await KV.put(emailKey, JSON.stringify(user));
      } catch (_) { /* non-critical */ }

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
