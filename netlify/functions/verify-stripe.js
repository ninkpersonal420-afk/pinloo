exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { sessionId } = JSON.parse(event.body);
    if (!sessionId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing sessionId' }) };

    const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Stripe not configured' }) };

    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
    });

    const session = await response.json();

    if (!response.ok) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid session', valid: false }) };
    }

    // Valid if payment paid or subscription complete
    const valid = session.payment_status === 'paid' || session.status === 'complete';
    const email = session.customer_details?.email || null;
    // amount_total is in cents: $12.00 = 1200, $79.00 = 7900
    const plan = (session.amount_total || 0) <= 1299 ? 'monthly' : 'annual';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ valid, email, plan, sessionId })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message, valid: false }) };
  }
};
