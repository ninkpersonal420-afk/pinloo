export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  try {
    const { sessionId } = await context.request.json();

    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Missing sessionId' }), { status: 400, headers: corsHeaders });
    }

    const STRIPE_SECRET = context.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET) {
      return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: corsHeaders });
    }

    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
    });

    const session = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Invalid session', valid: false }), { status: 400, headers: corsHeaders });
    }

    const valid = session.payment_status === 'paid' || session.status === 'complete';
    const email = session.customer_details?.email || null;
    const plan = (session.amount_total || 0) <= 1299 ? 'monthly' : 'annual';

    return new Response(JSON.stringify({ valid, email, plan, sessionId }), { status: 200, headers: corsHeaders });

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
