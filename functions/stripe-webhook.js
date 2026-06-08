// /functions/stripe-webhook.js
// Listens for Stripe subscription events and keeps the D1 database in sync.

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Read the raw request body (Stripe needs the unmodified bytes to verify the signature)
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  // 2. Verify the webhook signature so we know the request actually came from Stripe
  const verified = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!verified) {
    return new Response('Invalid signature', { status: 400 });
  }

  // 3. Parse the event
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return new Response('Invalid JSON', { status: 400 });
  }

  // 4. Route the event based on type
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(env.DB, event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(env.DB, event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(env.DB, event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(env.DB, event.data.object);
        break;
      default:
        // Ignore unrelated event types - return 200 so Stripe doesn't retry
        break;
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('Handler error: ' + err.message, { status: 500 });
  }
}

// --- Event handlers ---

async function handleCheckoutCompleted(db, session) {
  // Triggered when someone completes Stripe checkout. We use this to capture the email
  // immediately, even before the subscription.created event arrives.
  const email = (session.customer_email || session.customer_details?.email || '').toLowerCase().trim();
  if (!email) return;

  const customerId = session.customer || null;
  const subscriptionId = session.subscription || null;
  const now = Math.floor(Date.now() / 1000);

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

async function handleSubscriptionChange(db, subscription) {
  // Fired when a subscription is created or updated (renewal, plan change, etc).
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;
  const status = subscription.status; // 'active', 'trialing', 'past_due', 'canceled', etc
  const periodEnd = subscription.current_period_end || null;

  // Get the plan from the first subscription item's price
  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval || null;
  const plan = interval === 'year' ? 'annual' : (interval === 'month' ? 'monthly' : null);

  const now = Math.floor(Date.now() / 1000);

  // Find the email by customer ID (it was saved during checkout)
  const existing = await db.prepare(
    `SELECT email FROM subscribers WHERE stripe_customer_id = ?`
  ).bind(customerId).first();

  if (!existing) {
    // No matching record - this is unusual but possible if the subscription was created
    // outside of normal checkout flow. Skip silently.
    return;
  }

  await db.prepare(
    `UPDATE subscribers
     SET stripe_subscription_id = ?, status = ?, plan = ?, current_period_end = ?, updated_at = ?
     WHERE stripe_customer_id = ?`
  ).bind(subscriptionId, status, plan, periodEnd, now, customerId).run();
}

async function handleSubscriptionCanceled(db, subscription) {
  // Fired when a subscription is fully canceled (not just at-period-end).
  const customerId = subscription.customer;
  const now = Math.floor(Date.now() / 1000);

  await db.prepare(
    `UPDATE subscribers
     SET status = 'canceled', updated_at = ?
     WHERE stripe_customer_id = ?`
  ).bind(now, customerId).run();
}

async function handlePaymentFailed(db, invoice) {
  // Fired when a recurring payment fails. We mark the user as past_due so the app
  // shows them as Free until they update their card.
  const customerId = invoice.customer;
  if (!customerId) return;
  const now = Math.floor(Date.now() / 1000);

  await db.prepare(
    `UPDATE subscribers
     SET status = 'past_due', updated_at = ?
     WHERE stripe_customer_id = ?`
  ).bind(now, customerId).run();
}

// --- Signature verification ---
// Verifies the Stripe webhook signature using HMAC-SHA256.
// See https://stripe.com/docs/webhooks/signatures for spec.

async function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;

  // The header looks like: t=1234567890,v1=abc123...,v0=...
  const parts = Object.fromEntries(
    header.split(',').map(p => {
      const idx = p.indexOf('=');
      return [p.slice(0, idx), p.slice(idx + 1)];
    })
  );

  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;

  // Reject signatures older than 5 minutes (replay attack protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  // Compute the expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (computed.length !== expectedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return diff === 0;
}
