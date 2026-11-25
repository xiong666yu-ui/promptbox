/**
 * PromptBox License Worker (Cloudflare Workers)
 * ---------------------------------------------------------------
 * Holds the Creem API key server-side (as secret CREEM_API_KEY) so it is
 * never exposed in the extension bundle. Two endpoints:
 *
 *   POST /activate  { license_key, instance_name }   → first-time activation
 *   POST /validate  { license_key, instance_id? }    → status re-check
 *
 * Both talk to api.creem.io with header `x-api-key: $CREEM_API_KEY`
 * and body `product_id: $CREEM_PRODUCT_ID` (from wrangler.toml vars).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
    if (!env.CREEM_API_KEY) {
      return json({ ok: false, error: 'Server not configured: secret CREEM_API_KEY missing' }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === '/activate') return await activate(body, env);
      if (url.pathname === '/validate') return await validate(body, env);
      return json({ ok: false, error: 'Unknown endpoint' }, 404);
    } catch (e) {
      return json({ ok: false, error: 'Upstream error: ' + (e && e.message) }, 502);
    }
  },
};

async function callCreem(path, payload, env) {
  const res = await fetch('https://api.creem.io' + path, {
    method: 'POST',
    headers: {
      'x-api-key': env.CREEM_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    /* keep empty object on non-JSON response */
  }
  return { status: res.status, data };
}

async function activate(body, env) {
  if (!body || !body.license_key) return json({ ok: false, error: 'license_key is required' }, 400);
  // Creem expects exactly {"key", "instance_name"} — no product_id, no license_key field
  const { status, data } = await callCreem(
    '/v1/licenses/activate',
    {
      key: body.license_key,
      instance_name: (body.instance_name || 'PromptBox Device').slice(0, 60),
    },
    env
  );
  const active = status === 200 && (data?.id || data?.license_key?.status === 'active' || data?.valid === true);
  if (!active) {
    return json({ ok: false, error: 'Invalid license key' }, 400);
  }
  return json({ ok: true, instance_id: data.id, status: data.license_key?.status || 'active' });
}

async function validate(body, env) {
  if (!body || !body.license_key) return json({ ok: false, error: 'license_key is required' }, 400);
  // Creem expects exactly {"key", "instance_id"} — no product_id, no license_key field
  const { status, data } = await callCreem(
    '/v1/licenses/validate',
    {
      key: body.license_key,
      instance_id: body.instance_id || undefined,
    },
    env
  );
  const valid = status === 200 && data?.valid === true;
  return json({
    ok: true,
    valid,
    license_status: data?.license_key?.status || null,
    instance_id: data?.id || body.instance_id || null,
  });
}
