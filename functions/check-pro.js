// /functions/check-pro.js
// The app calls this with an email and gets back the user's Pro status.
// No authentication - if a user enters someone else's email, the worst they can do is
// "claim" that user's Pro subscription on their device. The legitimate user is unaffected.

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS headers - allow the app to call this from any page
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  try {
    const body = await request.json();
    const emailRaw = body.email;
    if (!emailRaw || typeof emailRaw !== 'string') {
      return jsonResponse({ isPro: false, error: 'Email required' }, 400, corsHeaders);
    }

    const email = emailRaw.toLowerCase().trim();
    // Quick sanity check - basic email shape, not full RFC validation
    if (!email.includes('@') || email.length < 5 || email.length > 254) {
      return jsonResponse({ isPro: false, error: 'Invalid email' }, 400, corsHeaders);
    }

    // Query the database
    const row = await env.DB.prepare(
      `SELECT status, plan, current_period_end FROM subscribers WHERE email = ?`
    ).bind(email).first();

    if (!row) {
      // Email not in database - they've never paid
      return jsonResponse({ isPro: false, status: 'free' }, 200, corsHeaders);
    }

    // Pro means: status is 'active' or 'trialing' (and not past_due, canceled, etc)
    const isPro = row.status === 'active' || row.status === 'trialing';

    return jsonResponse({
      isPro,
      status: row.status,
      plan: row.plan || null,
      periodEnd: row.current_period_end || null
    }, 200, corsHeaders);

  } catch (err) {
    console.error('check-pro error:', err);
    return jsonResponse({ isPro: false, error: 'Server error' }, 500, corsHeaders);
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}

function jsonResponse(data, status, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}
