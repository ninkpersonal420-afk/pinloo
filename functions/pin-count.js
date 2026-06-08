export async function onRequestGet(context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60'
  };

  try {
    const KV = context.env.PINLO_USERS;
    if (!KV) return new Response(JSON.stringify({ count: 0 }), { status: 200, headers });
    const val = await KV.get('__global_pins__');
    return new Response(JSON.stringify({ count: parseInt(val || '0') }), { status: 200, headers });
  } catch (_) {
    return new Response(JSON.stringify({ count: 0 }), { status: 200, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    }
  });
}
