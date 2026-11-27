/**
 * PromptBox License & Checkout Worker (Cloudflare Workers)
 * ---------------------------------------------------------------
 * Holds CREEM_API_KEY server-side as an encrypted Worker secret.
 *
 * Endpoints:
 *   GET  /health      → service health check
 *   GET  /checkout    → 302 redirect to Creem Checkout session (or CHECKOUT_URL override)
 *   POST /activate    → { license_key, instance_name }  (Creem /v1/licenses/activate)
 *   POST /validate    → { license_key, instance_id }    (Creem /v1/licenses/validate)
 *   POST /deactivate  → { license_key, instance_id }    (Creem /v1/licenses/deactivate)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });

function creemBaseUrl(env) {
  if (env.CREEM_API_BASE) return String(env.CREEM_API_BASE).replace(/\/+$/, '');
  const key = String(env.CREEM_API_KEY || '');
  return key.startsWith('creem_test_') ? 'https://test-api.creem.io' : 'https://api.creem.io';
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    if (request.method === 'GET') {
      if (url.pathname === '/health') {
        return json({ ok: true, service: 'promptbox-license' });
      }
      if (url.pathname === '/checkout') {
        return await handleCheckout(url, env);
      }
      return json({ ok: false, error: 'Not found' }, 404);
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405);
    }

    if (!env.CREEM_API_KEY) {
      return json({ ok: false, error: 'Server not configured: secret CREEM_API_KEY missing' }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    try {
      if (url.pathname === '/activate') return await activate(body, env);
      if (url.pathname === '/validate') return await validate(body, env);
      if (url.pathname === '/deactivate') return await deactivate(body, env);
      return json({ ok: false, error: 'Unknown endpoint' }, 404);
    } catch (e) {
      return json({ ok: false, error: 'Upstream error: ' + (e && e.message) }, 502);
    }
  },
};

async function callCreem(path, payload, env) {
  const res = await fetch(creemBaseUrl(env) + path, {
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
  } catch {
    /* keep empty object on non-JSON response */
  }
  return { status: res.status, data };
}

async function handleCheckout(url, env) {
  // 1. Explicit override URL if configured in Worker vars
  if (env.CHECKOUT_URL) {
    const target = new URL(env.CHECKOUT_URL);
    const discount = url.searchParams.get('discount_code');
    if (discount && !target.searchParams.has('discount_code')) {
      target.searchParams.set('discount_code', discount);
    }
    return Response.redirect(target.toString(), 302);
  }

  // 2. Dynamically create a Creem Checkout session via POST /v1/checkouts
  if (env.CREEM_API_KEY && env.CREEM_PRODUCT_ID) {
    try {
      const payload = { product_id: env.CREEM_PRODUCT_ID };
      const discount = url.searchParams.get('discount_code');
      if (discount) payload.discount_code = discount;
      if (env.CHECKOUT_SUCCESS_URL) payload.success_url = env.CHECKOUT_SUCCESS_URL;

      const { status, data } = await callCreem('/v1/checkouts', payload, env);
      if (status === 200 && data?.checkout_url) {
        return Response.redirect(data.checkout_url, 302);
      }
    } catch {
      /* fall through to friendly maintenance page */
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PromptBox Pro Checkout</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0c12;color:#f4f4f5;font-family:-apple-system,'Segoe UI',system-ui,sans-serif;padding:24px}
  .box{max-width:460px;background:#16171d;border:1px solid #2e303a;border-radius:16px;padding:28px;text-align:center}
  h1{font-size:20px;margin:0 0 10px}
  p{font-size:14px;color:#a6a6b0;line-height:1.6;margin:0 0 16px}
  a{color:#818cf8;text-decoration:none}
</style></head><body>
<div class="box">
  <h1>PromptBox Pro Checkout</h1>
  <p>Online checkout is temporarily undergoing payment provider verification and will open shortly.</p>
  <p>Need early access or assistance? Email <a href="mailto:xiong666yu@gmail.com">xiong666yu@gmail.com</a>.</p>
</div></body></html>`;

  return new Response(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function checkProductMatch(data, env) {
  if (!env.CREEM_PRODUCT_ID) return true;
  if (!data || !data.product_id) return true;
  return data.product_id === env.CREEM_PRODUCT_ID;
}

async function activate(body, env) {
  const key = body && typeof body.license_key === 'string' ? body.license_key.trim() : '';
  if (!key) return json({ ok: false, error: 'license_key is required' }, 400);

  const instanceName =
    (body && typeof body.instance_name === 'string' && body.instance_name.trim()
      ? body.instance_name.trim()
      : 'PromptBox Device'
    ).slice(0, 60);

  const { status, data } = await callCreem(
    '/v1/licenses/activate',
    { key, instance_name: instanceName },
    env
  );

  if (status === 200) {
    if (!checkProductMatch(data, env)) {
      return json({ ok: false, error: 'This license key is not valid for PromptBox Pro.' }, 403);
    }
    const licenseStatus = data?.status || data?.license_key?.status || null;
    const instanceId =
      data?.instance?.id ||
      (Array.isArray(data?.instance) ? data.instance[0]?.id : null) ||
      data?.instance_id ||
      null;

    if (licenseStatus === 'active' && instanceId) {
      return json({
        ok: true,
        instance_id: instanceId,
        status: licenseStatus,
      });
    }
    if (licenseStatus === 'expired') {
      return json({ ok: false, error: 'This license key has expired.' }, 410);
    }
    return json({ ok: false, error: 'This license key is not active.' }, 400);
  }

  if (status === 403) {
    return json(
      { ok: false, error: 'Activation limit reached for this license key. Deactivate an old device first.' },
      403
    );
  }
  if (status === 410) {
    return json({ ok: false, error: 'This license key has expired.' }, 410);
  }
  if (status === 401 || status === 429 || status >= 500) {
    return json({ ok: false, error: 'License server is temporarily busy. Please try again in a moment.' }, 502);
  }
  return json({ ok: false, error: 'Invalid license key — please double-check and try again.' }, 400);
}

async function validate(body, env) {
  const key = body && typeof body.license_key === 'string' ? body.license_key.trim() : '';
  const instanceId = body && typeof body.instance_id === 'string' ? body.instance_id.trim() : '';
  if (!key || !instanceId) {
    return json({ ok: true, valid: false, license_status: 'missing_parameters' });
  }

  const { status, data } = await callCreem(
    '/v1/licenses/validate',
    { key, instance_id: instanceId },
    env
  );

  if (status === 200) {
    const productOk = checkProductMatch(data, env);
    const licenseStatus = data?.status || data?.license_key?.status || null;
    const valid = productOk && licenseStatus === 'active';
    return json({
      ok: true,
      valid,
      license_status: licenseStatus,
      instance_id: data?.instance?.id || instanceId,
    });
  }

  // Definitive invalid/revoked/deleted states from Creem
  if (status === 400 || status === 403 || status === 404 || status === 410) {
    return json({
      ok: true,
      valid: false,
      license_status: data?.status || 'invalid',
    });
  }

  // Upstream hiccup / rate-limit / auth config error: do NOT falsely revoke user's local Pro state
  return json({ ok: false, error: 'Temporary license verification error' }, 502);
}

async function deactivate(body, env) {
  const key = body && typeof body.license_key === 'string' ? body.license_key.trim() : '';
  const instanceId = body && typeof body.instance_id === 'string' ? body.instance_id.trim() : '';
  if (!key || !instanceId) {
    return json({ ok: false, error: 'license_key and instance_id are required' }, 400);
  }

  const { status } = await callCreem(
    '/v1/licenses/deactivate',
    { key, instance_id: instanceId },
    env
  );

  if (status === 200 || status === 404) {
    return json({ ok: true });
  }
  return json({ ok: false, error: 'Could not release device seat right now.' }, status >= 500 ? 502 : 400);
}
