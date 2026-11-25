/**
 * PromptBox — Payment & License Layer (Creem + Cloudflare Worker)
 * ---------------------------------------------------------------
 * Free tier : max 5 prompts, max 2 custom folders, basic '/' insert.
 * Pro tier  : unlimited prompts & folders, variable fill-in,
 *             JSON import/export. One-time purchase ($6.99).
 *
 * Flow:
 *   1. User pays at the Creem Checkout page → receives a license key by email.
 *   2. User pastes the key into the popup → popup calls our Cloudflare Worker.
 *   3. Worker holds the Creem API key in a server-side secret, validates the
 *      key with Creem's API and returns an instance_id.
 *   4. On success the plugin stores { pb_pro, pb_instance_id, pb_license_key }
 *      in chrome.storage.local → Pro unlocked on all three sites.
 *   5. Every popup open re-validates silently; a revoked/expired license
 *      falls back to the Free tier automatically.
 *
 * The Creem API key NEVER lives in this file — only in the Worker secret.
 */
const PBPayment = (() => {
  // ==== CONFIG ====
  const CHECKOUT_URL = 'https://www.creem.io/product/prod_4GXKK2FVbguPycwyfCGaE';
  // TODO: after `wrangler deploy`, replace YOUR-SUBDOMAIN with the real one
  // shown in the deploy output (e.g. promptbox-license.my-name.workers.dev).
  const WORKER_URL = 'https://promptbox-license.xiong666yu.workers.dev';

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
      });
      resolve(pro);
    });
  }

  function isPro() { return pro; }
  function getInstanceId() { return instanceId; }

  /** Open the Creem Checkout page in a new tab. */
  function openCheckout() {
    window.open(CHECKOUT_URL, '_blank');
  }
  // legacy alias — content script toast still calls openUpgrade()
  const openUpgrade = openCheckout;

  async function post(path, payload) {
    const res = await fetch(WORKER_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  }

  /** Validate a pasted license key via the Worker; unlocks Pro on success. */
  async function activateLicense(key, instanceName) {
    const clean = (key || '').trim();
    if (!clean) return { ok: false, error: 'Please enter your license key first.' };
    let data;
    try {
      data = await post('/activate', {
        license_key: clean,
        instance_name: (instanceName || 'PromptBox Popup').slice(0, 60)
      });
    } catch (e) {
      return { ok: false, error: 'Cannot reach the license server. Check your connection and try again.' };
    }
    if (data && data.ok && data.instance_id) {
      licenseKey = clean;
      instanceId = data.instance_id;
      await set({ [PRO_KEY]: true, [INSTANCE_KEY]: instanceId, [LICENSE_KEY]: clean });
      pro = true;
      return { ok: true };
    }
    return { ok: false, error: (data && data.error) || 'Activation failed — please double-check your license key.' };
  }

  /** Silent re-check on popup open. A revoked/expired key drops back to Free. */
  async function validateStored() {
    if (!licenseKey) return { ok: true, valid: false };
    let data;
    try {
      data = await post('/validate', { license_key: licenseKey, instance_id: instanceId });
    } catch (e) {
      return { ok: false, error: 'network' }; // network hiccup: keep current state
    }
    const valid = !!(data && data.ok && data.valid);
    await set({ [PRO_KEY]: valid });
    pro = valid;
    return { ok: true, valid };
  }

  /** Free the seat on this device (license key kept for easy re-activation). */
  async function deactivate() {
    await set({ [PRO_KEY]: false, [INSTANCE_KEY]: null });
    pro = false;
    instanceId = null;
    return { ok: true };
  }

  return { init, isPro, getInstanceId, openCheckout, openUpgrade, activateLicense, validateStored, deactivate };
})();
