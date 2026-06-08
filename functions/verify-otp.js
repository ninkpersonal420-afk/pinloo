export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  try {
    const { email, code } = await context.request.json();
    const KV = context.env.PINLO_USERS;

    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'Email and code required' }), { status: 400, headers: corsHeaders });
    }

    const emailKey = email.toLowerCase().trim();

    // Look up OTP
    const stored = await KV.get(`otp:${emailKey}`);
    if (!stored) {
      return new Response(JSON.stringify({ error: 'Code expired or not found. Please request a new one.' }), { status: 400, headers: corsHeaders });
    }

    const { code: savedCode, createdAt } = JSON.parse(stored);

    // Check expiry (10 min)
    if (Date.now() - createdAt > 10 * 60 * 1000) {
      await KV.delete(`otp:${emailKey}`);
      return new Response(JSON.stringify({ error: 'Code has expired. Please request a new one.' }), { status: 400, headers: corsHeaders });
    }

    // Check code
    if (code.trim() !== savedCode) {
      return new Response(JSON.stringify({ error: 'Incorrect code. Please try again.' }), { status: 400, headers: corsHeaders });
    }

    // Delete OTP — single use
    await KV.delete(`otp:${emailKey}`);

    // Get or create user record
    let user = null;
    const userData = await KV.get(emailKey);
    if (userData) {
      user = JSON.parse(userData);
    } else {
      user = {
        email: emailKey,
        usage: 0,
        isPro: false,
        stripeCustomerId: null,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString()
      };
      await KV.put(emailKey, JSON.stringify(user));
    }

    return new Response(JSON.stringify({
      success: true,
      email: user.email,
      isPro: user.isPro || false,
      usage: user.usage || 0,
      plan: user.plan || null
    }), { headers: corsHeaders });

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
