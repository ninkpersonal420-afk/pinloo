export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  try {
    const { email } = await context.request.json();
    const KV = context.env.PINLO_USERS;
    const RESEND_API_KEY = context.env.RESEND_API_KEY;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400, headers: corsHeaders });
    }

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), { status: 500, headers: corsHeaders });
    }

    const emailKey = email.toLowerCase().trim();

    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in KV with 10 minute TTL
    await KV.put(`otp:${emailKey}`, JSON.stringify({ code, createdAt: Date.now() }), { expirationTtl: 600 });

    // Send email via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'Pinlo <noreply@getpinlo.com>',
        to: emailKey,
        subject: `${code} is your Pinlo login code`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FDF6EE;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF6EE;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#D94F38,#F5924A);padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px;">Pinlo</p>
            <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.8);">Pinterest Pin Generator</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:16px;color:#1a0f0a;font-weight:600;">Your login code</p>
            <p style="margin:0 0 28px;font-size:14px;color:#6b5c55;line-height:1.6;">Use this code to sign in to Pinlo. It expires in 10 minutes.</p>
            <!-- OTP Code -->
            <div style="background:#FDF6EE;border:2px solid #F5924A;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
              <p style="margin:0;font-size:42px;font-weight:800;letter-spacing:10px;color:#D94F38;font-family:'Courier New',monospace;">${code}</p>
            </div>
            <p style="margin:0;font-size:13px;color:#9e8a82;line-height:1.6;">If you didn't request this, you can safely ignore this email. Someone may have entered your address by mistake.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px 32px;border-top:1px solid #F0E8E0;">
            <p style="margin:0;font-size:12px;color:#b8a49c;text-align:center;">© Pinlo · <a href="https://getpinlo.com" style="color:#D94F38;text-decoration:none;">getpinlo.com</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('Resend error:', errData);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500, headers: corsHeaders });
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
