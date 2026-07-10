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
    const MAX_ATTEMPTS = 5;

    // Look up OTP
    const stored = await KV.get(`otp:${emailKey}`);
    if (!stored) {
      return new Response(JSON.stringify({ error: 'Code expired or not found. Please request a new one.' }), { status: 400, headers: corsHeaders });
    }

    const otpData = JSON.parse(stored);
    const { code: savedCode, createdAt, attempts = 0 } = otpData;

    // Check expiry (10 min)
    if (Date.now() - createdAt > 10 * 60 * 1000) {
      await KV.delete(`otp:${emailKey}`);
      return new Response(JSON.stringify({ error: 'Code has expired. Please request a new one.' }), { status: 400, headers: corsHeaders });
    }

    // Check attempt limit before comparing — invalidate OTP to prevent further guessing
    if (attempts >= MAX_ATTEMPTS) {
      await KV.delete(`otp:${emailKey}`);
      return new Response(JSON.stringify({ error: 'Too many incorrect attempts. Please request a new code.' }), { status: 400, headers: corsHeaders });
    }

    // Check code
    if (code.trim() !== savedCode) {
      const newAttempts = attempts + 1;
      if (newAttempts >= MAX_ATTEMPTS) {
        await KV.delete(`otp:${emailKey}`);
        return new Response(JSON.stringify({ error: 'Too many incorrect attempts. Please request a new code.' }), { status: 400, headers: corsHeaders });
      }
      // Update attempt count in the stored OTP
      await KV.put(`otp:${emailKey}`, JSON.stringify({ ...otpData, attempts: newAttempts }), { expirationTtl: Math.ceil((10 * 60 * 1000 - (Date.now() - createdAt)) / 1000) });
      return new Response(JSON.stringify({ error: 'Incorrect code. Please try again.' }), { status: 400, headers: corsHeaders });
    }

    // Delete OTP — single use
    await KV.delete(`otp:${emailKey}`);

    // Get or create user record
    const currentPeriod = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    let user = null;
    const userData = await KV.get(emailKey);
    if (userData) {
      user = JSON.parse(userData);
      // Monthly reset: free usage starts over each calendar month (mirrors claude.js)
      if (user.usagePeriod !== currentPeriod) {
        user.usage = 0;
        user.usagePeriod = currentPeriod;
        await KV.put(emailKey, JSON.stringify(user));
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
    console.error('verify-otp error:', err);
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
