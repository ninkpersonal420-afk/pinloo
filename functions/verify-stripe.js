export async function onRequestPost(context) {
  const corsHeaders = cors(context.request);

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

    // Only treat this as a real upgrade if it's a completed subscription checkout.
    const isSubscription = session.mode === 'subscription';
    const paid = session.payment_status === 'paid' || session.status === 'complete';
    const valid = isSubscription && paid;
    const stripeEmail = session.customer_details?.email || null;

    // Plan from the subscription's actual billing interval. The old amount_total
    // heuristic (<= $12.99 → monthly) breaks once sales tax is added to a charge.
    let plan = (session.amount_total || 0) <= 1299 ? 'monthly' : 'annual';
    if (session.subscription) {
      try {
        const subResp = await fetch(`https://api.stripe.com/v1/subscriptions/${session.subscription}`, {
          headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
        });
        if (subResp.ok) {
          const sub = await subResp.json();
          const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
          if (interval === 'year') plan = 'annual';
          else if (interval === 'month') plan = 'monthly';
        }
      } catch (_) { /* keep amount-based fallback */ }
    }

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
    console.error('verify-stripe error:', err);
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.', valid: false }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions({ request }) {
  return new Response(null, { headers: cors(request) });
}

function cors(request) {
  const origin = new URL(request.url).origin;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin'
  };
}
