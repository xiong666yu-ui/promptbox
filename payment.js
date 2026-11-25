/**
 * PromptBox — Payment Layer
 * ---------------------------------------------------------------
 * Free tier  : max 5 prompts, max 2 custom folders, basic '/' insert.
 * Pro tier   : unlimited prompts & folders, variable fill-in,
 *              JSON import/export. One-time purchase ($6.99).
 *
 * Built on ExtensionPay (ExtPay). Two things to do before release:
 *   1. Set DEV_MODE = false
 *   2. Replace EXPAY_EXTENSION_ID with your real extension id
 *      from https://extensionpay.com (then drop their ExtPay.js
 *      into this folder and add it in popup.html before payment.js,
 *      and in manifest.json content_scripts js list before payment.js).
 * While DEV_MODE = true everything runs locally with no network:
 *   clicking any "Upgrade" button toggles Pro instantly, so you can
 *   test both tiers in one reload-free session.
 */
const PBPayment = (() => {
  // ==== CONFIG ====
  const DEV_MODE = true;
  const EXPAY_EXTENSION_ID = 'your-extension-id'; // TODO: real ExtensionPay id
  const PRO_KEY = 'pb_pro';

  let pro = false;
  let extpay = null;

  function init() {
    return new Promise((resolve) => {
      chrome.storage.local.get([PRO_KEY], (d) => {
        pro = d[PRO_KEY] === true;
        resolve(pro);
      });
      chrome.storage.onChanged.addListener((c) => {
        if (c[PRO_KEY] !== undefined) pro = c[PRO_KEY].newValue === true;
      });
      if (!DEV_MODE && typeof ExtPay !== 'undefined') {
        try { extpay = ExtPay(EXPAY_EXTENSION_ID); } catch (e) { /* noop */ }
      }
    });
  }

  function isPro() { return pro; }

  function setPro(v) {
    const o = {};
    o[PRO_KEY] = !!v;
    chrome.storage.local.set(o);
  }

  /** Open the payment page. In DEV_MODE this toggles Pro locally. */
  function openUpgrade() {
    if (DEV_MODE) { setPro(!pro); return; }
    if (extpay) {
      try { extpay.openPaymentPage(); return; } catch (e) { /* fallthrough */ }
    }
    window.open('https://extensionpay.com/extension/' + EXPAY_EXTENSION_ID, '_blank');
  }

  return { init, isPro, setPro, openUpgrade, DEV_MODE };
})();
