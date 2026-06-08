var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// check-pro.js
async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  try {
    const body = await request.json();
    const emailRaw = body.email;
    if (!emailRaw || typeof emailRaw !== "string") {
      return jsonResponse({ isPro: false, error: "Email required" }, 400, corsHeaders);
    }
    const email = emailRaw.toLowerCase().trim();
    if (!email.includes("@") || email.length < 5 || email.length > 254) {
      return jsonResponse({ isPro: false, error: "Invalid email" }, 400, corsHeaders);
    }
    const row = await env.DB.prepare(
      `SELECT status, plan, current_period_end FROM subscribers WHERE email = ?`
    ).bind(email).first();
    if (!row) {
      return jsonResponse({ isPro: false, status: "free" }, 200, corsHeaders);
    }
    const isPro = row.status === "active" || row.status === "trialing";
    return jsonResponse({
      isPro,
      status: row.status,
      plan: row.plan || null,
      periodEnd: row.current_period_end || null
    }, 200, corsHeaders);
  } catch (err) {
    console.error("check-pro error:", err);
    return jsonResponse({ isPro: false, error: "Server error" }, 500, corsHeaders);
  }
}
__name(onRequestPost, "onRequestPost");
async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}
__name(onRequestOptions, "onRequestOptions");
function jsonResponse(data, status, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders }
  });
}
__name(jsonResponse, "jsonResponse");

// claude.js
async function onRequestPost2(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
  try {
    const body = await context.request.json();
    const ANTHROPIC_API_KEY = context.env.ANTHROPIC_API_KEY;
    const KV = context.env.PINLO_USERS;
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), { status: 500, headers: corsHeaders });
    }
    if (!KV) {
      return new Response(JSON.stringify({ error: "KV not configured" }), { status: 500, headers: corsHeaders });
    }
    const { email, type, ...anthropicBody } = body;
    if (type === "autofill" || type === "niche-tip") {
      const response2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(anthropicBody)
      });
      const data2 = await response2.json();
      return new Response(JSON.stringify(data2), { status: response2.status, headers: corsHeaders });
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid email required" }), { status: 400, headers: corsHeaders });
    }
    const emailKey = email.toLowerCase().trim();
    let user = null;
    const stored = await KV.get(emailKey);
    if (stored) {
      user = JSON.parse(stored);
    } else {
      user = {
        email: emailKey,
        usage: 0,
        isPro: false,
        stripeCustomerId: null,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastUsedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    if (!user.isPro && user.usage >= 5) {
      return new Response(JSON.stringify({
        error: "free_limit_reached",
        message: "You have used all 5 free pins. Upgrade to Pro for unlimited generation.",
        usage: user.usage,
        isPro: false
      }), { status: 402, headers: corsHeaders });
    }
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(anthropicBody)
    });
    const data = await response.json();
    if (response.ok) {
      user.usage = (user.usage || 0) + 1;
      user.lastUsedAt = (/* @__PURE__ */ new Date()).toISOString();
      await KV.put(emailKey, JSON.stringify(user));
    }
    return new Response(JSON.stringify(data), { status: response.status, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
__name(onRequestPost2, "onRequestPost");
async function onRequestOptions2() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}
__name(onRequestOptions2, "onRequestOptions");

// send-otp.js
async function onRequestPost3(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
  try {
    const { email } = await context.request.json();
    const KV = context.env.PINLO_USERS;
    const RESEND_API_KEY = context.env.RESEND_API_KEY;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email" }), { status: 400, headers: corsHeaders });
    }
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), { status: 500, headers: corsHeaders });
    }
    const emailKey = email.toLowerCase().trim();
    const code = Math.floor(1e5 + Math.random() * 9e5).toString();
    await KV.put(`otp:${emailKey}`, JSON.stringify({ code, createdAt: Date.now() }), { expirationTtl: 600 });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: "Pinlo <noreply@getpinlo.com>",
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
            <p style="margin:0;font-size:12px;color:#b8a49c;text-align:center;">\xA9 Pinlo \xB7 <a href="https://getpinlo.com" style="color:#D94F38;text-decoration:none;">getpinlo.com</a></p>
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
      console.error("Resend error:", errData);
      return new Response(JSON.stringify({ error: "Failed to send email" }), { status: 500, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
__name(onRequestPost3, "onRequestPost");
async function onRequestOptions3() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}
__name(onRequestOptions3, "onRequestOptions");

// stripe-webhook.js
async function onRequestPost4(context) {
  const { request, env } = context;
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }
  const verified = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!verified) {
    return new Response("Invalid signature", { status: 400 });
  }
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return new Response("Invalid JSON", { status: 400 });
  }
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(env.DB, event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChange(env.DB, event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionCanceled(env.DB, event.data.object);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(env.DB, event.data.object);
        break;
      default:
        break;
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response("Handler error: " + err.message, { status: 500 });
  }
}
__name(onRequestPost4, "onRequestPost");
async function handleCheckoutCompleted(db, session) {
  const email = (session.customer_email || session.customer_details?.email || "").toLowerCase().trim();
  if (!email) return;
  const customerId = session.customer || null;
  const subscriptionId = session.subscription || null;
  const now = Math.floor(Date.now() / 1e3);
  await db.prepare(
    `INSERT INTO subscribers (email, stripe_customer_id, stripe_subscription_id, status, plan, created_at, updated_at)
     VALUES (?, ?, ?, 'active', NULL, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       stripe_customer_id = excluded.stripe_customer_id,
       stripe_subscription_id = excluded.stripe_subscription_id,
       status = 'active',
       updated_at = excluded.updated_at`
  ).bind(email, customerId, subscriptionId, now, now).run();
}
__name(handleCheckoutCompleted, "handleCheckoutCompleted");
async function handleSubscriptionChange(db, subscription) {
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;
  const status = subscription.status;
  const periodEnd = subscription.current_period_end || null;
  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval || null;
  const plan = interval === "year" ? "annual" : interval === "month" ? "monthly" : null;
  const now = Math.floor(Date.now() / 1e3);
  const existing = await db.prepare(
    `SELECT email FROM subscribers WHERE stripe_customer_id = ?`
  ).bind(customerId).first();
  if (!existing) {
    return;
  }
  await db.prepare(
    `UPDATE subscribers
     SET stripe_subscription_id = ?, status = ?, plan = ?, current_period_end = ?, updated_at = ?
     WHERE stripe_customer_id = ?`
  ).bind(subscriptionId, status, plan, periodEnd, now, customerId).run();
}
__name(handleSubscriptionChange, "handleSubscriptionChange");
async function handleSubscriptionCanceled(db, subscription) {
  const customerId = subscription.customer;
  const now = Math.floor(Date.now() / 1e3);
  await db.prepare(
    `UPDATE subscribers
     SET status = 'canceled', updated_at = ?
     WHERE stripe_customer_id = ?`
  ).bind(now, customerId).run();
}
__name(handleSubscriptionCanceled, "handleSubscriptionCanceled");
async function handlePaymentFailed(db, invoice) {
  const customerId = invoice.customer;
  if (!customerId) return;
  const now = Math.floor(Date.now() / 1e3);
  await db.prepare(
    `UPDATE subscribers
     SET status = 'past_due', updated_at = ?
     WHERE stripe_customer_id = ?`
  ).bind(now, customerId).run();
}
__name(handlePaymentFailed, "handlePaymentFailed");
async function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const idx = p.indexOf("=");
      return [p.slice(0, idx), p.slice(idx + 1)];
    })
  );
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;
  const now = Math.floor(Date.now() / 1e3);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;
  const signedPayload = `${timestamp}.${payload}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (computed.length !== expectedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return diff === 0;
}
__name(verifyStripeSignature, "verifyStripeSignature");

// verify-otp.js
async function onRequestPost5(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
  try {
    const { email, code } = await context.request.json();
    const KV = context.env.PINLO_USERS;
    if (!email || !code) {
      return new Response(JSON.stringify({ error: "Email and code required" }), { status: 400, headers: corsHeaders });
    }
    const emailKey = email.toLowerCase().trim();
    const stored = await KV.get(`otp:${emailKey}`);
    if (!stored) {
      return new Response(JSON.stringify({ error: "Code expired or not found. Please request a new one." }), { status: 400, headers: corsHeaders });
    }
    const { code: savedCode, createdAt } = JSON.parse(stored);
    if (Date.now() - createdAt > 10 * 60 * 1e3) {
      await KV.delete(`otp:${emailKey}`);
      return new Response(JSON.stringify({ error: "Code has expired. Please request a new one." }), { status: 400, headers: corsHeaders });
    }
    if (code.trim() !== savedCode) {
      return new Response(JSON.stringify({ error: "Incorrect code. Please try again." }), { status: 400, headers: corsHeaders });
    }
    await KV.delete(`otp:${emailKey}`);
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
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastUsedAt: (/* @__PURE__ */ new Date()).toISOString()
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
__name(onRequestPost5, "onRequestPost");
async function onRequestOptions4() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}
__name(onRequestOptions4, "onRequestOptions");

// verify-stripe.js
async function onRequestPost6(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
  try {
    const { sessionId, email: clientEmail } = await context.request.json();
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Missing sessionId" }), { status: 400, headers: corsHeaders });
    }
    const STRIPE_SECRET = context.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), { status: 500, headers: corsHeaders });
    }
    const KV = context.env.PINLO_USERS;
    if (!KV) {
      return new Response(JSON.stringify({ error: "KV not configured" }), { status: 500, headers: corsHeaders });
    }
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { "Authorization": `Bearer ${STRIPE_SECRET}` }
    });
    const session = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Invalid session", valid: false }), { status: 400, headers: corsHeaders });
    }
    const valid = session.payment_status === "paid" || session.status === "complete";
    const stripeEmail = session.customer_details?.email || null;
    const plan = (session.amount_total || 0) <= 1299 ? "monthly" : "annual";
    if (valid) {
      const emailKey = (stripeEmail || clientEmail || "").toLowerCase().trim();
      if (emailKey && emailKey.includes("@")) {
        let user = null;
        const stored = await KV.get(emailKey);
        if (stored) {
          user = JSON.parse(stored);
        } else {
          user = {
            email: emailKey,
            usage: 0,
            isPro: false,
            stripeCustomerId: null,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            lastUsedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
        user.isPro = true;
        user.plan = plan;
        user.stripeSessionId = sessionId;
        user.stripeCustomerId = session.customer || null;
        user.upgradedAt = (/* @__PURE__ */ new Date()).toISOString();
        await KV.put(emailKey, JSON.stringify(user));
      }
    }
    return new Response(JSON.stringify({
      valid,
      email: stripeEmail,
      plan,
      sessionId
    }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, valid: false }), { status: 500, headers: corsHeaders });
  }
}
__name(onRequestPost6, "onRequestPost");
async function onRequestOptions5() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}
__name(onRequestOptions5, "onRequestOptions");

// ../.wrangler/tmp/pages-nctgcb/functionsRoutes-0.45315872579739214.mjs
var routes = [
  {
    routePath: "/check-pro",
    mountPath: "/",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions]
  },
  {
    routePath: "/check-pro",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/claude",
    mountPath: "/",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions2]
  },
  {
    routePath: "/claude",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/send-otp",
    mountPath: "/",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions3]
  },
  {
    routePath: "/send-otp",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/stripe-webhook",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/verify-otp",
    mountPath: "/",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions4]
  },
  {
    routePath: "/verify-otp",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/verify-stripe",
    mountPath: "/",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions5]
  },
  {
    routePath: "/verify-stripe",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  }
];

// ../../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
