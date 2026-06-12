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

    if (!message || typeof message !== 'string' || message.trim().length < 3) {
      return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400, headers: corsHeaders });
    }
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), { status: 500, headers: corsHeaders });
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
