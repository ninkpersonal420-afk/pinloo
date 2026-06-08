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

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500, headers: corsHeaders });
    }

    if (!KV) {
      return new Response(JSON.stringify({ error: 'KV not configured' }), { status: 500, headers: corsHeaders });
    }

    const { email, type, ...anthropicBody } = body;

    // --- Autofill and niche-tip requests skip enforcement entirely ---
    if (type === 'autofill' || type === 'niche-tip') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(anthropicBody)
      });
      const data = await response.json();
      return new Response(JSON.stringify(data), { status: response.status, headers: corsHeaders });
    }

    // --- Generation requests require valid email ---
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Valid email required' }), { status: 400, headers: corsHeaders });
    }

    const emailKey = email.toLowerCase().trim();

    // --- Internal admin bypass (no KV usage tracking) ---
    if (emailKey === 'admin@pinlo.internal') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(anthropicBody)
      });
      const data = await response.json();
      return new Response(JSON.stringify(data), { status: response.status, headers: corsHeaders });
    }

    // --- Look up user in KV ---
    let user = null;
    const stored = await KV.get(emailKey);

    if (stored) {
      user = JSON.parse(stored);
    } else {
      user = {
        email: emailKey,
        usage: 0,
        isPro: false,
        stripeCustomerId: null,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString()
      };
    }

    // --- Enforce free tier limit ---
    if (!user.isPro && user.usage >= 5) {
      return new Response(JSON.stringify({
        error: 'free_limit_reached',
        message: 'You have used all 5 free pins. Upgrade to Pro for unlimited generation.',
        usage: user.usage,
        isPro: false
      }), { status: 402, headers: corsHeaders });
    }

    // --- Call Anthropic ---
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropicBody)
    });

    const data = await response.json();

    // --- Increment usage on success ---
    if (response.ok) {
      user.usage = (user.usage || 0) + 1;
      user.lastUsedAt = new Date().toISOString();
      await KV.put(emailKey, JSON.stringify(user));

      // --- Increment global pin counter ---
      try {
        const totalKey = '__global_pins__';
        const current = await KV.get(totalKey);
        await KV.put(totalKey, String((parseInt(current || '0') + 1)));
      } catch (_) { /* non-critical — never fail the request */ }
    }

    return new Response(JSON.stringify(data), { status: response.status, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
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
