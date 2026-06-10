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
<body style="margin:0;padding:0;background:#FBF6F1;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FBF6F1;padding:48px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;">

        <!-- Logo above card -->
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <img src="https://getpinlo.com/logo.png" alt="Pinlo" width="52" height="52" style="border-radius:22%;display:block;"/>
                </td>
                <td style="padding-left:12px;vertical-align:middle;">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#160C07;letter-spacing:-0.5px;">Pinlo</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#8A6255;letter-spacing:0.2px;">Pinterest Pin Generator</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(22,12,7,0.1);">

            <!-- Gradient header -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:linear-gradient(135deg,#D94F38,#F5924A);padding:32px 48px 28px;">
                  <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px;">Here's your sign-in code</p>
                  <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.75);line-height:1.5;">Good for the next 10 minutes. Enter it in the app to get in.</p>
                </td>
              </tr>
            </table>

            <!-- Card body -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:32px 48px 16px;">
                  <!-- OTP box -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background:linear-gradient(135deg,rgba(217,79,56,0.06),rgba(245,146,74,0.06));border:2px solid rgba(217,79,56,0.2);border-radius:14px;padding:28px 24px;text-align:center;">
                        <p style="margin:0 0 10px;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#B89485;">Your code</p>
                        <p style="margin:0;font-size:52px;font-weight:800;letter-spacing:14px;color:#D94F38;font-family:'Courier New',Courier,monospace;padding-left:14px;">${code}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 48px 36px;">
                  <p style="margin:0;font-size:13px;color:#B89485;line-height:1.7;">Not you? Just ignore this — nothing will happen to your account.</p>
                </td>
              </tr>
            </table>

            <!-- Footer -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-top:1px solid #F0E8E0;padding:18px 48px;text-align:center;">
                  <p style="margin:0;font-size:12px;color:#c4b0a8;">© 2026 Pinlo &nbsp;·&nbsp; <a href="https://getpinlo.com" style="color:#D94F38;text-decoration:none;">getpinlo.com</a></p>
                </td>
              </tr>
            </table>

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
