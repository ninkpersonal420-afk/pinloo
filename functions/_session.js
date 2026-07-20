// Shared HMAC-signed session tokens for Pinlo.
//
// A token is `<body>.<sig>` where:
//   body = base64url(JSON.stringify({ e: email, exp: unixSeconds }))
//   sig  = base64url(HMAC-SHA256(body, SESSION_SECRET))
//
// verify-otp mints one after a successful OTP check; claude.js verifies it on
// the paid generation path so the endpoint no longer trusts a self-asserted
// email. Files prefixed with "_" are not routed by Cloudflare Pages, so this is
// import-only.

const encoder = new TextEncoder();

function b64urlFromBytes(buf) {
  const arr = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToString(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

async function hmacB64url(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return b64urlFromBytes(sig);
}

// Default token lifetime: 90 days.
export async function signSession(email, secret, ttlSeconds = 60 * 60 * 24 * 90) {
  const payload = { e: email, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = b64urlFromBytes(encoder.encode(JSON.stringify(payload)));
  const sig = await hmacB64url(secret, body);
  return body + '.' + sig;
}

// Returns { email, exp } if the token is authentic and unexpired, else null.
export async function verifySession(token, secret) {
  if (!token || typeof token !== 'string' || !secret) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = await hmacB64url(secret, body);
  // Constant-time comparison.
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;

  let payload;
  try { payload = JSON.parse(b64urlToString(body)); } catch (_) { return null; }
  if (!payload || !payload.e || !payload.exp) return null;
  if (Math.floor(Date.now() / 1000) > payload.exp) return null;
  return { email: payload.e, exp: payload.exp };
}
