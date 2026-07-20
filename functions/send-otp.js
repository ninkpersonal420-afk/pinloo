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

    // Per-IP cap: the per-email limit below can't stop one attacker from
    // scripting many different victim addresses to burn the Resend quota, so
    // also bound how many codes a single network can trigger per hour.
    const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipRateKey = `otp_ip:${ip}`;
    const ipCount = parseInt(await KV.get(ipRateKey).catch(() => '0') || '0');
    if (ipCount >= 20) {
      return new Response(JSON.stringify({ error: 'Too many code requests from this network. Please try again later.' }), { status: 429, headers: corsHeaders });
    }
    await KV.put(ipRateKey, String(ipCount + 1), { expirationTtl: 3600 }).catch(() => {});

    // Rate limit: max 1 send per 60 seconds, max 5 per hour per email
    const rateKey = `otp_rate:${emailKey}`;
    const rateRaw = await KV.get(rateKey).catch(() => null);
    const rate = rateRaw ? JSON.parse(rateRaw) : null;
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    if (rate) {
      if (now - rate.lastSent < 60000) {
        return new Response(JSON.stringify({ error: 'Please wait a moment before requesting another code.' }), { status: 429, headers: corsHeaders });
      }
      const windowCount = (now - rate.windowStart < oneHour) ? rate.count : 0;
      if (windowCount >= 5) {
        return new Response(JSON.stringify({ error: 'Too many code requests. Please try again in an hour.' }), { status: 429, headers: corsHeaders });
      }
    }

    const newRate = {
      lastSent: now,
      windowStart: (rate && now - rate.windowStart < oneHour) ? rate.windowStart : now,
      count: (rate && now - rate.windowStart < oneHour) ? rate.count + 1 : 1
    };
    await KV.put(rateKey, JSON.stringify(newRate), { expirationTtl: 3600 });

    // Generate 6-digit OTP with a CSPRNG (Math.random is predictable)
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const code = String(100000 + (buf[0] % 900000));

    // Store OTP in KV with 10 minute TTL; reset attempt counter
    await KV.put(`otp:${emailKey}`, JSON.stringify({ code, createdAt: Date.now(), attempts: 0 }), { expirationTtl: 600 });

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
        subject: `${code} is your Pinlo sign-in code`,
        html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your Pinlo sign-in code</title>
</head>
<body style="margin:0;padding:0;background-color:#FBF6F1;-webkit-text-size-adjust:100%;">
  <!-- Preheader: shows in inbox preview, hidden in the email body -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Your sign-in code is ${code}. It expires in 10 minutes.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FBF6F1" style="background-color:#FBF6F1;">
    <tr>
      <td align="center" style="padding:56px 20px 48px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;">

          <!-- Wordmark -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="https://getpinlo.com/logo.png" alt="Pinlo" width="40" height="40" style="display:block;border-radius:10px;"/>
                  </td>
                  <td style="vertical-align:middle;padding-left:11px;">
                    <span style="font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:700;color:#160C07;letter-spacing:-0.3px;">Pinlo</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #EFE4D9;border-radius:18px;padding:44px 44px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

                <tr>
                  <td align="center" style="padding-bottom:10px;">
                    <span style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2.5px;color:#B89485;text-transform:uppercase;">Sign-in code</span>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding-bottom:8px;">
                    <span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:#160C07;letter-spacing:-0.4px;">Enter this code to sign in</span>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding-bottom:30px;">
                    <span style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#8A6255;line-height:1.6;">It's valid for the next 10 minutes.</span>
                  </td>
                </tr>

                <!-- Code -->
                <tr>
                  <td align="center" style="padding-bottom:30px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" bgcolor="#FBF6F1" style="background-color:#FBF6F1;border:1px solid #EFE4D9;border-radius:14px;padding:26px 16px 24px;">
                          <span style="font-family:'Courier New',Courier,monospace;font-size:42px;font-weight:700;letter-spacing:12px;color:#160C07;padding-left:12px;">${code}</span>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding-top:14px;">
                          <span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#B89485;">One-time use &nbsp;·&nbsp; Expires in 10 minutes</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="border-top:1px solid #F3EAE1;padding-top:22px;">
                    <span style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#A88D80;line-height:1.7;">Didn't request this? You can safely ignore this email — no one can sign in without the code above, and your account is untouched.</span>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:26px;">
              <span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#C4B0A8;line-height:1.8;">
                © 2026 Pinlo &nbsp;·&nbsp; <a href="https://getpinlo.com" style="color:#A88D80;text-decoration:underline;">getpinlo.com</a><br>
                Sent because this address was used to sign in to Pinlo.
              </span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
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
    console.error('send-otp error:', err);
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
