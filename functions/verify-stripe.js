export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  try {
    const { sessionId, email: clientEmail } = await context.request.json();

    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Missing sessionId' }), { status: 400, headers: corsHeaders });
    }

    const STRIPE_SECRET = context.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET) {
      return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: corsHeaders });
    }

    const KV = context.env.PINLO_USERS;
    if (!KV) {
      return new Response(JSON.stringify({ error: 'KV not configured' }), { status: 500, headers: corsHeaders });
    }

    // --- Verify session with Stripe ---
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
    });

    const session = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Invalid session', valid: false }), { status: 400, headers: corsHeaders });
    }

    const valid = session.payment_status === 'paid' || session.status === 'complete';
    const stripeEmail = session.customer_details?.email || null;
    const plan = (session.amount_total || 0) <= 1299 ? 'monthly' : 'annual';

    // --- If payment is valid, flip isPro in KV ---
    if (valid) {
      // Use Stripe's email as source of truth, fall back to client-provided email
      const emailKey = (stripeEmail || clientEmail || '').toLowerCase().trim();

      if (emailKey && emailKey.includes('@')) {
        // Look up existing user or create new record
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

        // Flip to Pro
        user.isPro = true;
        user.plan = plan;
        user.stripeSessionId = sessionId;
        user.stripeCustomerId = session.customer || null;
        user.upgradedAt = new Date().toISOString();

        await KV.put(emailKey, JSON.stringify(user));
      }
    }

    return new Response(JSON.stringify({
      valid,
      email: stripeEmail,
      plan,
      sessionId
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, valid: false }), { status: 500, headers: corsHeaders });
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
