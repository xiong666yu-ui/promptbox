/**
 * PromptBox — Payment & License Layer (Creem + Cloudflare Worker)
 * ---------------------------------------------------------------
 * Free tier : max 5 prompts, max 2 custom folders, basic '/' insert.
 * Pro tier  : unlimited prompts & folders, variable fill-in,
 *             JSON import/export. One-time purchase ($6.99).
 *
 * Flow:
 *   1. User clicks Upgrade → Worker /checkout redirects to Creem Checkout.
 *   2. User receives a license key by email and pastes it into the popup.
 *   3. Worker validates the key with Creem's API and returns instance.id.
 *   4. Extension stores { pb_pro, pb_instance_id, pb_license_key } locally.
 *   5. Popup open silently re-validates; revoked/expired keys drop to Free,
 *      while temporary network/server hiccups preserve current state.
 *
 * The Creem API key NEVER lives in this file — only in the Worker secret.
 */
const PBPayment = (() => {
  // ==== CONFIG ====
  // Once your custom domain is bound to the Worker, update WORKER_URL here (e.g. https://api.yourdomain.com).
  const WORKER_URL = 'https://promptbox-license.xiong666yu.workers.dev';
  const CHECKOUT_URL = WORKER_URL + '/checkout';

  const PRO_KEY = 'pb_pro';
  const INSTANCE_KEY = 'pb_instance_id';
  const LICENSE_KEY = 'pb_license_key';

  let pro = false;
  let instanceId = null;
  let licenseKey = '';

  function get(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }
  function set(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }

  function init() {
    return new Promise(async (resolve) => {
      const d = await get([PRO_KEY, INSTANCE_KEY, LICENSE_KEY]);
      pro = d[PRO_KEY] === true;
      instanceId = d[INSTANCE_KEY] || null;
      licenseKey = d[LICENSE_KEY] || '';
      chrome.storage.onChanged.addListener((c) => {
        if (c[PRO_KEY] !== undefined) pro = c[PRO_KEY].newValue === true;
        if (c[INSTANCE_KEY] !== undefined) instanceId = c[INSTANCE_KEY].newValue || null;
        if (c[LICENSE_KEY] !== undefined) licenseKey = c[LICENSE_KEY].newValue || '';
      });
      resolve(pro);
    });
  }

  function isPro() { return pro; }
  function getInstanceId() { return instanceId; }

  /** Open the Checkout redirect endpoint in a new tab. */
  function openCheckout() {
    window.open(CHECKOUT_URL, '_blank');
  }
  const openUpgrade = openCheckout;

  async function post(path, payload) {
    const res = await fetch(WORKER_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => null);
    return { httpOk: res.ok, status: res.status, data };
  }

  /** Validate a pasted license key via the Worker; unlocks Pro on success. */
  async function activateLicense(key, instanceName) {
    const clean = (key || '').trim();
    if (!clean) return { ok: false, error: 'Please enter your license key first.' };
    let res;
    try {
      res = await post('/activate', {
        license_key: clean,
        instance_name: (instanceName || 'PromptBox Popup').slice(0, 60)
      });
    } catch {
      return { ok: false, error: 'Cannot reach the license server. Check your connection and try again.' };
    }
    const data = res.data;
    if (data && data.ok && data.instance_id) {
      licenseKey = clean;
      instanceId = data.instance_id;
      await set({ [PRO_KEY]: true, [INSTANCE_KEY]: instanceId, [LICENSE_KEY]: clean });
      pro = true;
      return { ok: true };
    }
    return { ok: false, error: (data && data.error) || 'Activation failed — please double-check your license key.' };
  }

  /** Silent re-check on popup open. Only definitive invalidation drops Pro; network/5xx hiccups keep state. */
  async function validateStored() {
    if (!licenseKey || !instanceId) {
      if (pro) {
        await set({ [PRO_KEY]: false });
        pro = false;
      }
      return { ok: true, valid: false };
    }
    let res;
    try {
      res = await post('/validate', { license_key: licenseKey, instance_id: instanceId });
    } catch {
      return { ok: false, error: 'network' };
    }
    const data = res.data;
    if (!data || data.ok !== true || typeof data.valid !== 'boolean') {
      return { ok: false, error: 'upstream' };
    }
    await set({ [PRO_KEY]: data.valid });
    pro = data.valid;
    return { ok: true, valid: data.valid };
  }

  /** Release the seat on Creem and clear Pro status on this device. */
  async function deactivate() {
    if (licenseKey && instanceId) {
      try {
        await post('/deactivate', { license_key: licenseKey, instance_id: instanceId });
      } catch {
        /* still allow local deactivation when offline */
      }
    }
    await set({ [PRO_KEY]: false, [INSTANCE_KEY]: null });
    pro = false;
    instanceId = null;
    return { ok: true };
  }

  return { init, isPro, getInstanceId, openCheckout, openUpgrade, activateLicense, validateStored, deactivate };
})();
