/* PromptBox content script — ChatGPT / Claude / Gemini */
(function () {
  'use strict';

  const DEFAULT_PROMPTS = [
    { id: '1', title: '代码审查与重构', folder: 'coding', text: '请帮我审查以下代码，指出潜在性能瓶颈并给出重构后的干净版本：\n' },
    { id: '2', title: '英文润色（学术/商务）', folder: 'writing', text: '请将以下内容润色为地道、专业的英文表达，保持原意不变：\n' },
    { id: '3', title: '核心要点提炼', folder: 'general', text: '请用 3-5 个清晰的要点总结以下内容的核心结论与行动建议：\n' }
  ];

  let prompts = [];
  let pro = false;
  let activeEditor = null;
  let slashInfo = null; // position of the trailing "/token" that summoned the menu
  let menuEl = null;
  let menuIndex = 0;
  let filtered = [];
  let varModal = null;
  let pendingItem = null;
  let toastEl = null;

  // ---------- state ----------
  function loadState() {
    chrome.storage.local.get(['prompts', 'pb_pro'], (res) => {
      prompts = Array.isArray(res.prompts) && res.prompts.length ? res.prompts : DEFAULT_PROMPTS;
      pro = res.pb_pro === true;
    });
  }
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.prompts) prompts = changes.prompts.newValue || [];
    if (changes.pb_pro) pro = changes.pb_pro.newValue === true;
  });
  PBPayment.init();
  loadState();

  // ---------- utils ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function isEditable(el) {
    if (!el || !el.tagName) return false;
    return el.tagName === 'TEXTAREA' || el.isContentEditable;
  }
  function getText(el) {
    return el.tagName === 'TEXTAREA' ? el.value : (el.innerText || el.textContent || '');
  }
  /** React-controlled textareas silently ignore execCommand('insertText') —
   *  write via the native value setter + a bubbled input event instead. */
  function setTextareaValue(el, s) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + s + el.value.slice(end);
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    setter.call(el, next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.selectionStart = el.selectionEnd = start + s.length;
  }
  /** insert text preserving newlines in both textarea & contenteditable */
  function typeInto(el, s) {
    if (el.tagName === 'TEXTAREA') {
      setTextareaValue(el, s);
      return;
    }
    const lines = s.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) document.execCommand('insertLineBreak');
      if (lines[i]) document.execCommand('insertText', false, lines[i]);
    }
  }
  function extractVariables(text) {
    const out = [];
    const seen = new Set();
    const re = /\[([^\[\]\n]{1,30})\]/g;
    let m;
    while ((m = re.exec(text))) {
      if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
    }
    return out;
  }
  const HAS_VAR = /\[[^\[\]\n]+\]/;

  // ---------- menu ----------
  function ensureMenu() {
    if (menuEl) return menuEl;
    menuEl = document.createElement('div');
    menuEl.id = 'promptbox-menu';
    document.body.appendChild(menuEl);
    return menuEl;
  }
  function positionMenu(menu, editor) {
    const r = editor.getBoundingClientRect();
    const w = Math.min(400, Math.max(280, r.width));
    menu.style.width = w + 'px';
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 12));
    menu.style.left = left + 'px';
    const below = window.innerHeight - r.bottom;
    if (below > 340) {
      menu.style.top = (r.bottom + 6) + 'px';
      menu.style.bottom = 'auto';
    } else {
      menu.style.bottom = (window.innerHeight - r.top + 8) + 'px';
      menu.style.top = 'auto';
    }
  }
  function showMenu(editor, keyword) {
    const kw = keyword.toLowerCase();
    filtered = prompts.filter((p) => p.title.toLowerCase().includes(kw)).slice(0, 8);
    const menu = ensureMenu();
    menu.innerHTML = '';
    if (!filtered.length) {
      menuIndex = -1;
      menu.innerHTML = '<div class="pb-empty">No matching prompt — click the PromptBox toolbar icon to add one</div>';
    } else {
      menuIndex = 0;
      filtered.forEach((item, i) => {
        const row = document.createElement('div');
        row.className = 'promptbox-item' + (i === 0 ? ' pb-active' : '');
        const tag = HAS_VAR.test(item.text)
          ? '<span class="pb-tag" title="Variable fill-in">⌗' + (pro ? '' : ' PRO') + '</span>'
          : '';
        row.innerHTML =
          '<div class="pb-row"><span class="pb-title">⚡ ' + esc(item.title) + '</span>' + tag + '</div>' +
          '<div class="pb-preview">' + esc(item.text.slice(0, 90)) + '</div>';
        row.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); pick(item); };
        menu.appendChild(row);
      });
    }
    menu.style.display = 'block';
    positionMenu(menu, editor);
  }
  function hideMenu() {
    if (menuEl) menuEl.style.display = 'none';
    filtered = [];
    menuIndex = 0;
  }
  function moveSel(dir) {
    if (!filtered.length) return;
    menuIndex = (menuIndex + dir + filtered.length) % filtered.length;
    const rows = menuEl.querySelectorAll('.pb-item');
    rows.forEach((r, i) => r.classList.toggle('pb-active', i === menuIndex));
    if (rows[menuIndex]) rows[menuIndex].scrollIntoView({ block: 'nearest' });
  }

  // ---------- insert ----------
  function insertFinal(text) {
    hideMenu();
    closeVarModal();
    const ed = activeEditor;
    if (!ed || !isEditable(ed)) return;
    ed.focus();
    if (slashInfo && slashInfo.len > 0) {
      if (ed.tagName === 'TEXTAREA') {
        // replace just the trailing "/token" via the native setter (React-safe)
        const next = ed.value.slice(0, slashInfo.start) + text;
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ed), 'value').set;
        setter.call(ed, next);
        ed.dispatchEvent(new Event('input', { bubbles: true }));
        ed.selectionStart = ed.selectionEnd = slashInfo.start + text.length;
      } else {
        // contenteditable: the caret sits right after the just-typed "/token",
        // so backspace over it, then insert the prompt (keeps surrounding text)
        for (let i = 0; i < slashInfo.len; i++) document.execCommand('delete');
        typeInto(ed, text);
      }
    } else {
      typeInto(ed, text);
    }
    activeEditor = null;
    slashInfo = null;
  }

  function pick(item) {
    if (HAS_VAR.test(item.text)) {
      if (!pro) { showUpgradeToast('Variable fill-in is a Pro feature'); return; }
      openVarModal(item);
      return;
    }
    insertFinal(item.text);
  }

  // ---------- variable modal ----------
  function openVarModal(item) {
    closeVarModal();
    hideMenu();
    pendingItem = item;
    const vars = extractVariables(item.text);
    varModal = document.createElement('div');
    varModal.id = 'pb-var-modal';
    varModal.innerHTML =
      '<div class="pb-var-card">' +
      '<div class="pb-var-title">⚡ ' + esc(item.title) + '</div>' +
      vars.map((v) =>
        '<label class="pb-var-label">' + esc(v) +
        '<input class="pb-var-input" data-v="' + esc(v) + '" placeholder="Enter value…" autocomplete="off"></label>'
      ).join('') +
      '<div class="pb-var-actions">' +
      '<button type="button" class="pb-var-cancel">Cancel (Esc)</button>' +
      '<button type="button" class="pb-var-ok">Insert ⏎</button>' +
      '</div></div>';
    document.body.appendChild(varModal);
    varModal.querySelector('.pb-var-ok').onclick = () => submitVars();
    varModal.querySelector('.pb-var-cancel').onclick = () => closeVarModal();
    const first = varModal.querySelector('.pb-var-input');
    if (first) setTimeout(() => first.focus(), 30);
  }
  function submitVars() {
    if (!varModal || !pendingItem) return;
    let text = pendingItem.text;
    varModal.querySelectorAll('.pb-var-input').forEach((inp) => {
      const v = inp.dataset.v;
      const val = (inp.value || '').trim() || '[' + v + ']';
      text = text.split('[' + v + ']').join(val);
    });
    insertFinal(text);
  }
  function closeVarModal() {
    if (varModal) { varModal.remove(); varModal = null; }
    pendingItem = null;
  }

  // ---------- upgrade toast ----------
  function showUpgradeToast(msg) {
    hideMenu();
    if (toastEl) toastEl.remove();
    toastEl = document.createElement('div');
    toastEl.id = 'pb-toast';
    toastEl.innerHTML =
      '<span>✨ ' + esc(msg) + ' — one-time $6.99, free forever after.</span>' +
      '<button type="button">Upgrade</button>';
    toastEl.querySelector('button').onclick = () => {
      PBPayment.openUpgrade(); // DEV_MODE: toggles Pro instantly for testing
      toastEl.remove();
      toastEl = null;
    };
    document.body.appendChild(toastEl);
    setTimeout(() => { if (toastEl) { toastEl.remove(); toastEl = null; } }, 8000);
  }

  // ---------- events ----------
  document.addEventListener('input', (e) => {
    const ed = e.target;
    if (!isEditable(ed)) return;
    const raw = getText(ed) || '';
    // Only summon the menu when the trailing "/token" sits at the very start
    // of the input, or right after a space/newline. "1/2" or "https://..."
    // therefore never trigger (their "/" hugs a digit or a colon).
    const m = raw.match(/(?:^|[\t\n\r ])\/([^\s/]*)$/);
    if (m) {
      activeEditor = ed;
      slashInfo = {
        start: m.index + m[0].length - (m[1].length + 1), // position of "/"
        len: m[1].length + 1                              // "/token" length
      };
      showMenu(ed, m[1]);
    } else if (!varModal) {
      hideMenu();
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    // variable modal open: Enter submits, Esc closes
    if (varModal) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeVarModal(); }
      else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); submitVars(); }
      return;
    }
    const menuOpen = menuEl && menuEl.style.display === 'block';
    if (!menuOpen) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); moveSel(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); moveSel(-1); }
    else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault(); e.stopPropagation();
      if (menuIndex >= 0 && filtered[menuIndex]) pick(filtered[menuIndex]);
    }
    else if (e.key === 'Escape') { hideMenu(); }
  }, true);

  document.addEventListener('click', (e) => {
    if (menuEl && !menuEl.contains(e.target)) hideMenu();
  });
})();
