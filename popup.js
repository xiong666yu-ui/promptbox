/* PromptBox popup logic */
const FREE_PROMPTS = 5;
const FREE_CUSTOM_FOLDERS = 2;

const DEFAULT_FOLDERS = [
  { id: 'general', name: '通用', preset: true },
  { id: 'coding', name: '编程', preset: true },
  { id: 'writing', name: '写作', preset: true }
];
const DEFAULT_PROMPTS = [
  { id: '1', title: '代码审查与重构', folder: 'coding', text: '请帮我审查以下代码，指出潜在性能瓶颈并给出重构后的干净版本：\n' },
  { id: '2', title: '英文润色（学术/商务）', folder: 'writing', text: '请将以下内容润色为地道、专业的英文表达，保持原意不变：\n' },
  { id: '3', title: '核心要点提炼', folder: 'general', text: '请用 3-5 个清晰的要点总结以下内容的核心结论与行动建议：\n' }
];

let prompts = [];
let folders = [];
let pro = false;
let activeFolder = 'all';

const $ = (id) => document.getElementById(id);
const titleInput = $('title-input');
const textInput = $('text-input');
const addBtn = $('add-btn');
const listEl = $('prompt-list');
const quotaEl = $('quota');
const planBadge = $('plan-badge');
const upgradeBtn = $('upgrade-btn');
const folderBar = $('folder-bar');
const folderSelect = $('folder-select');
const exportBtn = $('export-btn');
const importBtn = $('import-btn');
const importFile = $('import-file');
const devBtn = $('dev-btn');

const VAR_RE = /\[[^\[\]\n]+\]/;

function load() {
  chrome.storage.local.get(['prompts', 'folders', 'pb_pro'], (res) => {
    prompts = Array.isArray(res.prompts) && res.prompts.length ? res.prompts : DEFAULT_PROMPTS;
    folders = Array.isArray(res.folders) && res.folders.length ? res.folders : DEFAULT_FOLDERS;
    pro = res.pb_pro === true;
    if (!res.prompts || !res.folders) chrome.storage.local.set({ prompts, folders });
    render();
  });
}
function save(cb) { chrome.storage.local.set({ prompts, folders }, cb || render); }
function folderName(id) {
  const f = folders.find((x) => x.id === id);
  return f ? f.name : '通用';
}

// ---------- render ----------
function render() { renderPlan(); renderFolders(); renderSelect(); renderList(); }

function renderPlan() {
  planBadge.textContent = pro ? 'PRO' : 'FREE';
  planBadge.className = 'badge ' + (pro ? 'pro' : 'free');
  quotaEl.textContent = pro
    ? 'Unlimited prompts · unlimited folders · lifetime license'
    : `${prompts.length}/${FREE_PROMPTS} prompts · ${folders.filter((f) => !f.preset).length}/${FREE_CUSTOM_FOLDERS} custom folders`;
  upgradeBtn.textContent = pro ? '✓ Pro' : 'Upgrade $6.99';
  upgradeBtn.disabled = pro;
  devBtn.hidden = !PBPayment.DEV_MODE;
}

function renderFolders() {
  folderBar.innerHTML = '';
  const mk = (label, key, extra, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (activeFolder === key ? ' on' : '') + (cls ? ' ' + cls : '');
    b.innerHTML = label;
    if (extra) b.appendChild(extra);
    b.onclick = () => { if (!extra) { activeFolder = key; render(); } };
    return b;
  };
  folderBar.appendChild(mk('All', 'all'));
  folders.forEach((f) => {
    const count = prompts.filter((p) => p.folder === f.id).length;
    let fx = null;
    if (!f.preset) {
      fx = document.createElement('span');
      fx.className = 'fx';
      fx.textContent = '×';
      fx.title = 'Delete folder';
      fx.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`Delete folder "${f.name}"? Prompts inside move to 通用.`)) return;
        folders = folders.filter((x) => x.id !== f.id);
        prompts.forEach((p) => { if (p.folder === f.id) p.folder = 'general'; });
        if (activeFolder === f.id) activeFolder = 'all';
        save();
      };
    }
    folderBar.appendChild(mk(`${folderName(f.id)} <span class="cnt">${count}</span>`, f.id, fx));
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'chip add';
  add.textContent = '+ folder';
  add.title = pro ? 'New folder' : `New folder (free: max ${FREE_CUSTOM_FOLDERS} custom)`;
  add.onclick = newFolder;
  folderBar.appendChild(add);
}

function renderSelect() {
  folderSelect.innerHTML = '';
  folders.forEach((f) => {
    const o = document.createElement('option');
    o.value = f.id;
    o.textContent = f.name;
    folderSelect.appendChild(o);
  });
}

function renderList() {
  listEl.innerHTML = '';
  const shown = activeFolder === 'all' ? prompts : prompts.filter((p) => p.folder === activeFolder);
  if (!shown.length) {
    listEl.innerHTML = '<div class="card" style="justify-content:center;color:var(--muted);font-size:12px">No prompts in this folder yet</div>';
    return;
  }
  shown.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'card';
    const main = document.createElement('div');
    main.className = 'card-main';
    const tags =
      (VAR_RE.test(item.text) ? '<span class="ptag">⌗ vars</span>' : '') +
      (pro ? '' : '');
    main.innerHTML =
      `<div class="card-title">${esc(item.title)} ${tags}</div>` +
      `<div class="card-meta">${esc(folderName(item.folder))} · ${esc(item.text.slice(0, 60))}</div>`;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del-btn';
    del.textContent = 'Delete';
    del.onclick = () => {
      prompts = prompts.filter((p) => p.id !== item.id);
      save();
    };
    card.appendChild(main);
    card.appendChild(del);
    listEl.appendChild(card);
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------- actions ----------
function newFolder() {
  const name = prompt('New folder name:');
  if (!name || !name.trim()) return;
  if (!pro && folders.filter((f) => !f.preset).length >= FREE_CUSTOM_FOLDERS) {
    alert(`Free version allows ${FREE_CUSTOM_FOLDERS} custom folders.\nUpgrade to Pro ($6.99 lifetime) for unlimited folders.`);
    return;
  }
  folders.push({ id: 'f' + Date.now(), name: name.trim().slice(0, 20), preset: false });
  save();
}

addBtn.onclick = () => {
  const title = titleInput.value.trim();
  const text = textInput.value.trim();
  if (!title || !text) return;
  if (!pro && prompts.length >= FREE_PROMPTS) {
    alert(`Free version allows ${FREE_PROMPTS} prompts.\nUpgrade to Pro ($6.99 lifetime) for unlimited prompts.`);
    return;
  }
  prompts.unshift({ id: Date.now().toString(), title, text, folder: folderSelect.value });
  save(() => { titleInput.value = ''; textInput.value = ''; render(); });
};

upgradeBtn.onclick = () => {
  if (pro) return;
  PBPayment.openUpgrade(); // DEV_MODE: instantly toggles Pro
  setTimeout(load, 300);
};

devBtn.onclick = () => {
  PBPayment.setPro(!PBPayment.isPro());
  setTimeout(load, 150);
};

exportBtn.onclick = () => {
  if (!pro) return needPro('Export/Import backup is a Pro feature');
  const blob = new Blob([JSON.stringify({ app: 'promptbox', version: 2, prompts, folders }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'promptbox-backup.json';
  a.click();
  URL.revokeObjectURL(url);
};

importBtn.onclick = () => {
  if (!pro) return needPro('Export/Import backup is a Pro feature');
  importFile.click();
};

importFile.onchange = () => {
  const f = importFile.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const ps = Array.isArray(data) ? data : data.prompts;
      const fsIn = Array.isArray(data) ? null : data.folders;
      if (!Array.isArray(ps) || ps.some((p) => !p.title || typeof p.text !== 'string')) {
        throw new Error('expected {prompts:[{title,text}...]}');
      }
      if (!pro && prompts.length + ps.length > FREE_PROMPTS) {
        alert(`Import would exceed the free limit of ${FREE_PROMPTS} prompts.`);
        return;
      }
      const key = (p) => p.title + '|' + p.text;
      const have = new Set(prompts.map(key));
      const incoming = ps
        .filter((p) => !have.has(key(p)))
        .map((p) => ({ id: Date.now().toString() + Math.random().toString(36).slice(2, 6), title: p.title, text: p.text, folder: p.folder || 'general' }));
      if (fsIn) fsIn.forEach((fo) => { if (fo && fo.id && fo.name && !folders.some((x) => x.id === fo.id)) folders.push({ id: fo.id, name: fo.name, preset: !!fo.preset }); });
      prompts = incoming.concat(prompts);
      save();
    } catch (e) {
      alert('Invalid backup file: ' + e.message);
    }
  };
  reader.readAsText(f);
  importFile.value = '';
};

function needPro(msg) {
  alert(msg + '\nUpgrade to Pro ($6.99 lifetime) to unlock it.');
  PBPayment.openUpgrade();
  setTimeout(load, 300);
}

PBPayment.init().then(load);
