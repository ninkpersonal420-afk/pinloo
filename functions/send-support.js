export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  try {
    const { type, email, message } = await context.request.json();
    const RESEND_API_KEY = context.env.RESEND_API_KEY;
    const KV = context.env.PINLO_USERS;

    if (!message || typeof message !== 'string' || message.trim().length < 3) {
      return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400, headers: corsHeaders });
    }
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), { status: 500, headers: corsHeaders });
    }

    // Abuse guard: this endpoint is unauthenticated and sends email, so cap it
    // per originating IP per day to prevent inbox/Resend-quota flooding.
    if (KV) {
      try {
        const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
        const today = new Date().toISOString().slice(0, 10);
        const rlKey = `support:${ip}:${today}`;
        const count = parseInt(await KV.get(rlKey) || '0');
        if (count >= 20) {
          return new Response(JSON.stringify({ error: 'Too many messages today. Please email us directly.' }), { status: 429, headers: corsHeaders });
        }
        await KV.put(rlKey, String(count + 1), { expirationTtl: 86400 });
      } catch (_) { /* non-critical */ }
    }

    const safeType = String(type || 'general').slice(0, 50);
    const safeEmail = String(email || 'not provided').slice(0, 254);
    const safeMessage = String(message).slice(0, 4000);
    const subject = `Pinlo ${safeType.charAt(0).toUpperCase() + safeType.slice(1)} — ${safeEmail}`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'Pinlo Support <noreply@getpinlo.com>',
        to: 'pinlosupport@proton.me',
        reply_to: safeEmail.includes('@') ? safeEmail : undefined,
        subject,
        text: `Type: ${safeType}\nFrom: ${safeEmail}\n\n${safeMessage}`
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('Resend support error:', errData);
      return new Response(JSON.stringify({ error: 'Failed to send message' }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });

  } catch (err) {
    console.error('send-support error:', err);
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
