export async function onRequestGet(context) {
  const { request } = context;
  const headers = {
    ...cors(request),
    'Cache-Control': 'public, max-age=60'
  };

  try {
    const KV = context.env.PINLO_USERS;
    if (!KV) return new Response(JSON.stringify({ count: 0 }), { status: 200, headers });
    const BASE_COUNT = 76; // pins generated before counter was added
    const val = await KV.get('__global_pins__');
    return new Response(JSON.stringify({ count: BASE_COUNT + parseInt(val || '0') }), { status: 200, headers });
  } catch (_) {
    return new Response(JSON.stringify({ count: 0 }), { status: 200, headers });
  }
}

export async function onRequestOptions({ request }) {
  return new Response(null, { headers: cors(request) });
}

function cors(request) {
  const origin = new URL(request.url).origin;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin'
  };
}
