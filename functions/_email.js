// Shared email helpers. Prefixed with `_` so Cloudflare Pages does NOT route it
// as an endpoint. Import from other functions, e.g. verify-otp.js.
//
// All transactional mail goes through Resend from the verified Pinlo sender.
// Templates share the OTP email's visual system: cream (#FBF6F1) canvas, white
// card, Georgia serif wordmark/headings, warm-brown supporting text, brand-red
// (#D94F38) accents.

const FROM = 'Pinlo <noreply@getpinlo.com>';
const APP_URL = 'https://getpinlo.com/app';
const SITE_URL = 'https://getpinlo.com';

// Low-level Resend send. Returns true on success, false on failure — never
// throws, so callers can fire-and-forget without breaking their own response.
export async function sendEmail(RESEND_API_KEY, { to, subject, html }) {
  if (!RESEND_API_KEY) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({ from: FROM, to, subject, html })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('Resend send error:', errData);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Resend send exception:', err);
    return false;
  }
}

// Sent once, the first time an email verifies an OTP (account creation).
// This is the activation nudge — confirm the account, set expectations for the
// free tier, and drive the user back to generate their first pin.
export async function sendWelcomeEmail(env, email) {
  return sendEmail(env.RESEND_API_KEY, {
    to: email,
    subject: 'Welcome to Pinlo — let’s make your first pin',
    html: welcomeHtml()
  });
}

function welcomeHtml() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Welcome to Pinlo</title>
</head>
<body style="margin:0;padding:0;background-color:#FBF6F1;-webkit-text-size-adjust:100%;">
  <!-- Preheader: shows in inbox preview, hidden in the email body -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Your account is ready — turn any product into a search-ready Pinterest pin in seconds.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

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
                    <img src="${SITE_URL}/logo.png" alt="Pinlo" width="40" height="40" style="display:block;border-radius:10px;"/>
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
                    <span style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2.5px;color:#B89485;text-transform:uppercase;">Welcome</span>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding-bottom:14px;">
                    <span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:#160C07;letter-spacing:-0.4px;">You’re in — let’s make your first pin</span>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <span style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#8A6255;line-height:1.65;">Pinlo turns a product, niche, and pain point into Pinterest-ready copy — a title, description, and hashtags built to rank in search. No more staring at a blank box.</span>
                  </td>
                </tr>

                <!-- Steps -->
                <tr>
                  <td style="padding-bottom:8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:14px;">
                          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                            <td style="vertical-align:top;"><span style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:#D94F38;">1.</span></td>
                            <td style="padding-left:12px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#5C463C;line-height:1.6;">Enter your product, niche, and the pain it solves.</span></td>
                          </tr></table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:14px;">
                          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                            <td style="vertical-align:top;"><span style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:#D94F38;">2.</span></td>
                            <td style="padding-left:12px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#5C463C;line-height:1.6;">Pinlo writes an SEO-scored title, description, and 12 hashtags.</span></td>
                          </tr></table>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                            <td style="vertical-align:top;"><span style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:#D94F38;">3.</span></td>
                            <td style="padding-left:12px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#5C463C;line-height:1.6;">Drop it onto Pinterest with your image and publish.</span></td>
                          </tr></table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- CTA -->
                <tr>
                  <td align="center" style="padding:30px 0 8px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" bgcolor="#D94F38" style="background-color:#D94F38;border-radius:12px;">
                          <a href="${APP_URL}" style="display:inline-block;padding:15px 34px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;">Generate your first pin →</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Free tier note -->
                <tr>
                  <td style="padding-top:26px;border-top:1px solid #F3EAE1;">
                    <span style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#A88D80;line-height:1.7;">Your free plan includes <strong style="color:#8A6255;">10 pins every month</strong>. Pro unlocks unlimited pins, bulk generation, and full SEO scores whenever you’re ready.</span>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:26px;">
              <span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#C4B0A8;line-height:1.8;">
                © 2026 Pinlo &nbsp;·&nbsp; <a href="${SITE_URL}" style="color:#A88D80;text-decoration:underline;">getpinlo.com</a><br>
                Sent because this address was just used to create a Pinlo account.
              </span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
