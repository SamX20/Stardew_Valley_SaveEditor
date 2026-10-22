/* محرر سيف ستاردو — الواجهة */
'use strict';
const W = window.SDV_WORLD, ITEMS = window.SDV_ITEMS, BYID = {};
ITEMS.forEach(i => BYID[i.id] = i);
SDV.setEnv({ DOMParser, XMLSerializer, templates: window.SDV_TEMPLATES, world: W, items: ITEMS });
const H = SDV.helpers;
const SKILL_AR = ['الزراعة', 'الصيد', 'جمع المنتجات البرية', 'التعدين', 'القتال'];
const SKILL_EN = ['Farming', 'Fishing', 'Foraging', 'Mining', 'Combat'];
const SEASON_AR = ['الربيع', 'الصيف', 'الخريف', 'الشتاء'];
const QUALITY_AR = { 0: 'عادية', 1: 'فضية', 2: 'ذهبية', 4: 'إيريديوم' };
const SHEET = { springobjects: [384, 16, 16], Objects_2: [128, 16, 16], Craftables: [128, 16, 32], weapons: [128, 16, 16], tools: [336, 16, 16], hats: [240, 20, 20, 80], shirts: [256, 8, 8, 32] };

const App = window.App = {
  st: { root: null, saveDir: null, saveName: null, save: null, tab: 'home', undo: [], farmerUid: null, saves: [] },
  // ---------- tiny DOM builder ----------
  h(tag, attrs, ...ch) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of ch.flat(9)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  },
  icon(qid, size = 32, cls = '') {
    const it = BYID[qid]; const h = App.h;
    if (qid === 'MONEY') return h('span', { class: 'ico ' + cls, style: { width: size + 'px', height: size + 'px', background: 'url(assets/ui/coin.png) center/contain no-repeat' } });
    if (!it || !it.s) return h('span', { class: 'ico blank ' + cls, style: { width: size + 'px', height: size + 'px' }, title: it ? it.en : qid });
    const [sheet, idx, w, hh] = it.s; const meta = SHEET[sheet];
    if (!meta) return h('span', { class: 'ico blank ' + cls, style: { width: size + 'px', height: size + 'px' } });
    const [sw, cw, ch, rowH] = meta; const cols = Math.floor(sw / cw);
    const x = (idx % cols) * cw, y = Math.floor(idx / cols) * (rowH || ch);
    const scale = size / Math.max(w, hh);
    const e = h('span', { class: 'ico ' + cls, title: it.en });
    Object.assign(e.style, { width: (w * scale) + 'px', height: (hh * scale) + 'px', backgroundImage: `url(assets/sheets/${sheet}.png)`, backgroundPosition: `-${x * scale}px -${y * scale}px`, backgroundSize: `${sw * scale}px auto` });
    return e;
  },
  itemName(qid) { const it = BYID[qid]; return it ? it.en : qid; },
  itemAr(qid) { const it = BYID[qid]; return it ? (it.ar || '') : ''; },
  toast(msg, bad) { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); clearTimeout(App._tt); App._tt = setTimeout(() => t.className = 'toast hidden', 3200); },
  modal(content) { const m = document.getElementById('modal'); const b = document.getElementById('modalBody'); b.innerHTML = ''; b.append(content); m.classList.remove('hidden'); },
  closeModal() { document.getElementById('modal').classList.add('hidden'); },
  // ---------- undo ----------
  snap() { const s = App.st.save; if (!s) return; App.st.undo.push(s.doc.documentElement.cloneNode(true)); if (App.st.undo.length > 25) App.st.undo.shift(); document.getElementById('btnUndo').disabled = false; },
  undo() {
    const s = App.st.save; const prev = App.st.undo.pop(); if (!s || !prev) return;
    s.doc.replaceChild(prev, s.doc.documentElement); s.root = prev; s.touch();
    document.getElementById('btnUndo').disabled = !App.st.undo.length; App.render(); App.toast('رجعت خطوة لورا');
  },
  change(fn) { try { App.snap(); fn(); App.markDirty(); } catch (e) { App.st.undo.pop(); App.toast(e.message || String(e), true); console.error(e); } },
  markDirty() { document.getElementById('btnSave').disabled = !App.st.save; document.getElementById('saveLabel').textContent = App.label() + (App.st.save && App.st.save.dirty ? ' • في تعديلات مش محفوظة' : ''); },
  label() { if (!App.st.save) return 'ما في سيف مفتوح'; const s = App.st.save.summary(); return `${s.farm} (${s.name}) — ${SEASON_AR[SDV.SEASONS.indexOf(s.season)]} ${s.day}، سنة ${s.year}`; },
  // ---------- file system ----------
  async idb(op, val) {
    return new Promise(res => { try { const r = indexedDB.open('sdv-editor', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { const tx = r.result.transaction('kv', op === 'get' ? 'readonly' : 'readwrite'); const s = tx.objectStore('kv'); const q = op === 'get' ? s.get('dir') : s.put(val, 'dir'); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }; r.onerror = () => res(null); } catch (e) { res(null); } });
  },
  async openFolder(handle) {
    if (!window.showDirectoryPicker) { App.toast('متصفحك ما بيدعم فتح المجلدات. استعمل Chrome أو Edge.', true); return; }
    try {
      const dir = handle || await window.showDirectoryPicker({ id: 'sdvsaves', mode: 'readwrite' });
      if (handle && (await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
      App.st.root = dir; App.idb('put', dir);
      const saves = [];
      if (await App.hasFile(dir, 'SaveGameInfo')) saves.push({ dir, name: dir.name });
      else for await (const [name, h] of dir.entries()) if (h.kind === 'directory' && await App.hasFile(h, 'SaveGameInfo') && await App.hasFile(h, name)) saves.push({ dir: h, name });
      for (const s of saves) { try { const t = await (await (await s.dir.getFileHandle('SaveGameInfo')).getFile()).text(); const d = new DOMParser().parseFromString(t.replace(/^﻿/, ''), 'text/xml').documentElement; s.farm = H.txt(d, 'farmName'); s.player = H.txt(d, 'name'); s.money = H.num(d, 'money'); s.day = H.num(d, 'dayOfMonthForSaveGame'); s.season = H.num(d, 'seasonForSaveGame'); s.year = H.num(d, 'yearForSaveGame'); } catch (e) { } }
      App.st.saves = saves;
      if (!saves.length) App.toast('ما لقيت سيفات بهاد المجلد. اختار مجلد Saves.', true);
      App.st.tab = 'home'; App.render();
    } catch (e) { if (e.name !== 'AbortError') App.toast(e.message, true); }
  },
  stamp() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`; },
  async hasFile(dir, name) { try { await dir.getFileHandle(name); return true; } catch (e) { return false; } },
  async loadSave(s) {
    if (App.st.save && App.st.save.dirty && !confirm('في تعديلات مش محفوظة. بدك تكمل وتتجاهلها؟')) return;
    try {
      const main = await (await (await s.dir.getFileHandle(s.name)).getFile()).text();
      let info = null; try { info = await (await (await s.dir.getFileHandle('SaveGameInfo')).getFile()).text(); } catch (e) { }
      App.st.save = new SDV.Save(main, info); App.st.uploadMode = null; App.st.saveDir = s.dir; App.st.saveName = s.name; App.st.undo = [];
      App.st.farmerUid = App.st.save.player() && H.txt(App.st.save.player(), 'UniqueMultiplayerID');
      document.getElementById('btnUndo').disabled = true; App.markDirty(); App.st.tab = 'players'; App.render();
      App.toast('فتحت السيف: ' + App.label());
    } catch (e) { App.toast('ما قدرت أفتح السيف: ' + e.message, true); console.error(e); }
  },
  async writeSave() {
    const s = App.st.save; if (!s) return;
    if (!confirm('تأكد إن اللعبة مسكّرة قبل الحفظ.\nبحفظ نسخة احتياطية أول وبعدين بكتب التعديلات. أكمل؟')) return;
    try {
      const dir = App.st.saveDir; const name = App.st.saveName;
      const bdir = await dir.getDirectoryHandle('editor_backups', { create: true });
      const stamp = App.stamp();
      const bsub = await bdir.getDirectoryHandle(stamp, { create: true });
      for (const f of [name, 'SaveGameInfo']) { try { const src = await (await dir.getFileHandle(f)).getFile(); const w = await (await bsub.getFileHandle(f, { create: true })).createWritable(); await w.write(await src.arrayBuffer()); await w.close(); } catch (e) { } }
      // prune old backups (keep 15)
      const all = []; for await (const [n, h] of bdir.entries()) if (h.kind === 'directory') all.push(n); all.sort();
      while (all.length > 15) { const n = all.shift(); try { await bdir.removeEntry(n, { recursive: true }); } catch (e) { } }
      const enc = new TextEncoder();
      const w1 = await (await dir.getFileHandle(name)).createWritable(); await w1.write(enc.encode(s.serialize())); await w1.close();
      const w2 = await (await dir.getFileHandle('SaveGameInfo', { create: true })).createWritable(); await w2.write(enc.encode(s.serializeInfo())); await w2.close();
      s.dirty = false; App.markDirty(); App.toast('✔ انحفظ! النسخة الاحتياطية بمجلد editor_backups/' + stamp);
    } catch (e) { App.toast('صار خطأ بالحفظ: ' + e.message, true); console.error(e); }
  },
  async listBackups() {
    const out = []; try { const b = await App.st.saveDir.getDirectoryHandle('editor_backups'); for await (const [n, h] of b.entries()) if (h.kind === 'directory') out.push({ n, h }); } catch (e) { }
    return out.sort((a, b) => b.n.localeCompare(a.n));
  },
  async restoreBackup(b) {
    if (!confirm('برجّع السيف لنسخة ' + b.n + '؟ (السيف الحالي بينحفظ كنسخة احتياطية كمان)')) return;
    const dir = App.st.saveDir, name = App.st.saveName;
    const bdir = await dir.getDirectoryHandle('editor_backups', { create: true }); const stamp = App.stamp() + '-before-restore';
    const bsub = await bdir.getDirectoryHandle(stamp, { create: true });
    for (const f of [name, 'SaveGameInfo']) { try { const src = await (await dir.getFileHandle(f)).getFile(); const w = await (await bsub.getFileHandle(f, { create: true })).createWritable(); await w.write(await src.arrayBuffer()); await w.close(); } catch (e) { } }
    for (const f of [name, 'SaveGameInfo']) { try { const src = await (await b.h.getFileHandle(f)).getFile(); const w = await (await dir.getFileHandle(f, { create: true })).createWritable(); await w.write(await src.arrayBuffer()); await w.close(); } catch (e) { } }
    App.st.save = null; await App.loadSave({ dir, name }); App.toast('رجّعت النسخة ' + b.n);
  },
  // ---------- render ----------
  render() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === App.st.tab));
    const main = document.getElementById('main'); main.innerHTML = '';
    const page = App.h('div', { class: 'page' });
    const needSave = !['home', 'wiki'].includes(App.st.tab);
    if (needSave && !App.st.save) page.append(App.h('div', { class: 'empty' }, 'افتح سيف من الرئيسية أول 🌱'));
    else (App.pages[App.st.tab] || App.pages.home)(page);
    main.append(page);
  },
  farmer() { const s = App.st.save; const f = s.farmers().find(x => x.uid === App.st.farmerUid) || s.farmers()[0]; return f; },
  farmerSelect(onchange) {
    const s = App.st.save; const h = App.h;
    const sel = h('select', { onchange: e => { App.st.farmerUid = e.target.value; (onchange || App.render)(); } }, s.realFarmers().map(f => h('option', { value: f.uid, selected: f.uid === App.st.farmerUid }, (f.name || '(بدون اسم)') + (f.host ? ' — الهوست' : ''))));
    return h('div', { class: 'field', style: { maxWidth: '280px' } }, h('label', null, 'اللاعب'), sel);
  },
  // ---------- item picker ----------
  pickItem(opts, onPick) {
    const h = App.h; opts = opts || {};
    const kinds = opts.kinds || null; let filter = opts.filter || null;
    const q = h('input', { type: 'search', placeholder: 'ابحث بالإنجليزي أو بالعربي… مثلاً Sprinkler أو رشاش', style: { width: '100%' } });
    const list = h('div', { class: 'picker-list' });
    const cats = [['', 'الكل'], ['O', 'أغراض'], ['BC', 'آلات وأغراض كبيرة'], ['W', 'أسلحة'], ['T', 'أدوات'], ['H', 'قبعات'], ['S', 'قمصان'], ['P', 'بناطيل'], ['B', 'أحذية']].filter(c => !kinds || !c[0] || kinds.includes(c[0]));
    let cat = kinds && kinds.length === 1 ? kinds[0] : '';
    const catSel = h('select', { onchange: e => { cat = e.target.value; draw(); } }, cats.map(c => h('option', { value: c[0], selected: c[0] === cat }, c[1])));
    const stack = h('input', { type: 'number', value: 1, min: 1, max: 999, style: { width: '90px' } });
    const qual = h('select', null, Object.entries(QUALITY_AR).map(([k, v]) => h('option', { value: k }, v)));
    function draw() {
      const t = q.value.trim().toLowerCase(); list.innerHTML = ''; let n = 0;
      for (const it of ITEMS) {
        if (it.hid) continue; if (kinds && !kinds.includes(it.k)) continue; if (cat && it.k !== cat) continue; if (filter && !filter(it)) continue;
        if (t && !(it.en.toLowerCase().includes(t) || (it.ar || '').includes(t) || it.n.toLowerCase().includes(t))) continue;
        if (!window.SDV_TEMPLATES[it.id]) continue;
        list.append(h('button', { class: 'pick', onclick: () => { App.closeModal(); onPick(it.id, Math.max(1, +stack.value || 1), +qual.value); } }, App.icon(it.id, 32), h('span', null, h('b', { class: 'en' }, it.en), h('small', null, it.ar || W.cat[it.c] || ''))));
        if (++n >= 250) break;
      }
      if (!n) list.append(h('div', { class: 'muted' }, 'ما لقيت شي'));
    }
    q.oninput = draw; draw();
    App.modal(h('div', null, h('h2', null, opts.title || 'اختار غرض'), h('div', { class: 'row' }, h('div', { style: { flex: 1, minWidth: '220px' } }, q), catSel,
      opts.noStack ? null : h('label', { class: 'row', style: { gap: '6px' } }, 'العدد', stack), opts.noStack ? null : h('label', { class: 'row', style: { gap: '6px' } }, 'الجودة', qual)), list));
    setTimeout(() => q.focus(), 50);
  },
  // ---------- slot grid ----------
  slotGrid(container, opts) {
    const s = App.st.save; const h = App.h; opts = opts || {};
    const grid = h('div', { class: 'slots' });
    const list = H.kids(container, 'Item');
    list.forEach((el, i) => {
      const info = s.itemInfo(el);
      const slot = h('div', { class: 'slot', title: info ? `${info.name}${info.stack > 1 ? ' ×' + info.stack : ''}` : 'خانة فاضية', onclick: () => App.editSlot(container, i, opts) });
      if (info) { slot.append(App.icon(info.qid, 36)); if (info.stack > 1) slot.append(h('span', { class: 'n' }, info.stack)); if (info.quality) slot.append(h('span', { class: 'q', style: { backgroundImage: `url(assets/ui/quality_${info.quality === 1 ? 'silver' : info.quality === 2 ? 'gold' : 'iridium'}.png)` } })); }
      grid.append(slot);
    });
    if (opts.chest) grid.append(h('div', { class: 'slot add', title: 'ضيف غرض', onclick: () => App.pickItem({}, (qid, n, q) => App.change(() => { s.addToContainer(container, s.createItem(qid, n, q), true); App.render(); })) }, '+'));
    return grid;
  },
  editSlot(container, i, opts) {
    const s = App.st.save; const h = App.h; const el = H.kids(container, 'Item')[i]; const info = s.itemInfo(el);
    if (!info) { App.pickItem({}, (qid, n, q) => App.change(() => { s.setSlot(container, i, s.createItem(qid, n, q)); App.render(); })); return; }
    const it = BYID[info.qid] || {};
    const stack = h('input', { type: 'number', min: 1, max: 9999, value: info.stack, style: { width: '110px' } });
    const qual = h('select', null, Object.entries(QUALITY_AR).map(([k, v]) => h('option', { value: k, selected: +k === info.quality }, v)));
    const canStack = H.kid(el, 'stack') && ['Object', 'ColoredObject'].includes(info.type);
    App.modal(h('div', null,
      h('div', { class: 'row' }, App.icon(info.qid, 64), h('div', null, h('h2', { class: 'en', style: { margin: 0 } }, info.name), h('div', null, it.ar || ''), h('div', { class: 'muted' }, W.cat[it.c] || ''))),
      canStack ? h('div', { class: 'row', style: { marginTop: '12px' } }, h('label', { class: 'row', style: { gap: '6px' } }, 'العدد', stack), h('label', { class: 'row', style: { gap: '6px' } }, 'الجودة', qual)) : null,
      h('div', { class: 'row', style: { marginTop: '14px' } },
        canStack ? h('button', { class: 'btn btn-green', onclick: () => App.change(() => { s.setStack(el, +stack.value); s.setQuality(el, +qual.value); App.closeModal(); App.render(); }) }, 'حفظ') : null,
        h('button', { class: 'btn', onclick: () => App.pickItem({}, (qid, n, q) => App.change(() => { s.setSlot(container, i, s.createItem(qid, n, q)); App.render(); })) }, 'بدّله بغرض ثاني'),
        h('button', { class: 'btn btn-blue', onclick: () => { App.closeModal(); App.st.tab = 'wiki'; App.st.wikiSel = info.qid; App.render(); } }, '📖 معلومات'),
        h('button', { class: 'btn btn-red', onclick: () => App.change(() => { if (opts && opts.chest) container.removeChild(el); else s.setSlot(container, i, null); App.closeModal(); App.render(); }) }, 'احذف'))
    ));
  },
  hearts(points, max, per, onset) {
    const h = App.h; const n = Math.floor(points / per); const wrap = h('div', { class: 'hearts' });
    for (let i = 1; i <= max; i++) wrap.append(h('span', { class: 'heart' + (i <= n ? ' on' : ''), title: i + ' قلب', onclick: () => onset(i === n ? (i - 1) * per : i * per) }));
    return wrap;
  },
  pages: {}
};

// ======================= PAGES =======================
App.pages.home = (pg) => {
  const h = App.h; const st = App.st;
  pg.append(h('div', { class: 'home-hero' },
    h('div', { style: { flex: 1, minWidth: '280px' } },
      h('h2', null, 'أهلاً سام 👋'),
      h('p', null, 'افتح مجلد السيفات، اختار السيف، وعدّل اللي بدك إياه. قبل كل حفظ البرنامج بياخذ نسخة احتياطية لحاله.'),
      h('div', { class: 'notice' }, '⚠️ سكّر اللعبة قبل ما تحفظ. وإذا طلعلك تنبيه Steam Cloud لما تفتح اللعبة اختار ', h('b', null, 'Local'), '.'),
      h('p', { class: 'muted' }, 'المتصفح ما بيسمح يفتح مجلد AppData. فأول مرة بس: سكّر اللعبة وشغّل ملف ', h('code', { class: 'en' }, 'setup_saves_link.bat'), ' اللي بمجلد البرنامج. بعدها اضغط "افتح مجلد السيفات"، وبشريط العنوان بنافذة الاختيار الصق ', h('code', { class: 'en' }, '%USERPROFILE%\\StardewSaves'), ' واضغط Enter، وبعدين "اختيار مجلد".'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => App.openFolder() }, '📂 افتح مجلد السيفات'), h('button', { class: 'btn btn-blue', onclick: () => App.openUpload() }, '📤 ارفع سيف من جهازك'), h('button', { class: 'btn btn-small', id: 'btnLast', style: { display: 'none' }, onclick: async () => App.openFolder(await App.idb('get')) }, '↺ افتح آخر مجلد')))
  ));
  App.idb('get').then(d => { if (d && !st.saves.length) { const b = document.getElementById('btnLast'); if (b) b.style.display = ''; } });
  if (st.saves.length) {
    pg.append(h('h3', null, 'السيفات اللي لقيتها'));
    pg.append(h('div', { class: 'savelist' }, st.saves.map(s => h('div', { class: 'wood savecard', onclick: () => App.loadSave(s) },
      h('div', { class: 'row' }, h('span', { style: { fontSize: '28px' } }, '🌾'), h('div', null, h('b', { style: { fontSize: '18px' } }, s.farm || s.name), h('div', { class: 'muted en' }, s.name))),
      h('div', { class: 'kv', style: { marginTop: '6px' } }, h('b', null, 'اللاعب'), h('span', null, s.player || '-'), h('b', null, 'التاريخ'), h('span', null, `${SEASON_AR[s.season] || ''} ${s.day || ''}، سنة ${s.year || ''}`), h('b', null, 'المصاري'), h('span', null, (s.money || 0).toLocaleString() + 'g'))))));
  }
  if (st.save && !st.uploadMode) {
    const box = h('div', null, h('h3', null, 'النسخ الاحتياطية لهاد السيف'), h('div', { class: 'muted' }, 'جاري التحميل…'));
    pg.append(box);
    App.listBackups().then(list => { box.lastChild.remove(); if (!list.length) box.append(h('div', { class: 'muted' }, 'لسا ما في نسخ (بتنعمل أول ما تحفظ).')); else box.append(h('table', null, h('tbody', null, list.map(b => h('tr', null, h('td', { class: 'en' }, b.n), h('td', null, h('button', { class: 'btn btn-small', onclick: () => App.restoreBackup(b) }, 'رجّع هاي النسخة')))))));});
  }
};

App.pages.players = (pg) => {
  const h = App.h, s = App.st.save;
  pg.append(h('h2', null, 'اللاعبين'));
  if (s.sharedWallet()) pg.append(h('div', { class: 'muted' }, '💰 المصاري مشتركة بينكم (محفظة وحدة)، فتعديلها بيغيّرها للكل.'));
  const grid = h('div', { class: 'grid cards' });
  for (const f of s.realFarmers()) {
    const el = f.el; const card = h('div', { class: 'wood card' });
    card.append(h('h3', null, '🧑‍🌾 ', f.name || '(بدون اسم)', f.host ? h('span', { class: 'pill green', style: { marginRight: '8px' } }, 'الهوست') : h('span', { class: 'pill blue', style: { marginRight: '8px' } }, 'لاعب ثاني')));
    if (!f.host) card.append(h('button', { class: 'btn btn-small btn-blue', style: { marginBottom: '8px' }, onclick: () => {
      if (!confirm(`بدك ${f.name} يصير الهوست؟\n\n• ${f.name} بيصير صاحب المزرعة وبيسكن بالبيت الكبير، و${s.farmers()[0].name} بيصير لاعب ثاني وبيسكن بالكوخ.\n• المصاري والمهارات والشناط والعلاقات بتضل مع كل واحد.\n• اللي جوّا البيوت (أثاث، ثلاجة) ما بينتقل.\n• بتقدر ترجّعها بنفس الزر.\n\nبعدها احفظ، والهوست الجديد بيفتح السيف من Load على جهازه.`)) return;
      App.change(() => { const r = s.swapHost(f.uid); App.st.farmerUid = f.uid; App.render(); App.toast(`👑 ${r.newHost} صار الهوست. لا تنسى تحفظ.`); });
    } }, '👑 خلّيه الهوست'));
    const money = h('input', { type: 'number', value: s.getMoney(el), min: 0 });
    card.append(h('div', { class: 'field' }, h('label', null, 'المصاري (g)'), h('div', { class: 'row' }, money, h('button', { class: 'btn btn-small btn-green', onclick: () => App.change(() => { s.setMoney(el, +money.value); App.render(); App.toast('تمام'); }) }, 'طبّق'))));
    // skills
    const sk = s.skills(el); const profs = s.professions(el);
    const tbl = h('table', null, h('tbody', null, sk.map((x, i) => {
      const lv = h('select', { onchange: e => App.change(() => { s.setSkillLevel(el, i, +e.target.value); App.render(); }) }, Array.from({ length: 11 }, (_, n) => h('option', { value: n, selected: n === x.level }, n)));
      const tree = W.proftree[i]; const cur5 = tree.map(t => t[0]).find(p => profs.includes(p)); const cur10 = tree.flatMap(t => t[1]).find(p => profs.includes(p));
      const p5 = x.level >= 5 ? h('select', { onchange: e => App.change(() => { s.setProfession(el, i, 5, e.target.value === '' ? null : +e.target.value); App.render(); }) }, h('option', { value: '' }, '— اختار —'), tree.map(t => h('option', { value: t[0], selected: cur5 === t[0] }, W.prof[t[0]][1]))) : h('span', { class: 'muted' }, 'من مستوى 5');
      const opts10 = cur5 != null ? tree.find(t => t[0] === cur5)[1] : [];
      const p10 = x.level >= 10 && cur5 != null ? h('select', { onchange: e => App.change(() => { s.setProfession(el, i, 10, e.target.value === '' ? null : +e.target.value); App.render(); }) }, h('option', { value: '' }, '— اختار —'), opts10.map(p => h('option', { value: p, selected: cur10 === p }, W.prof[p][1]))) : null;
      return h('tr', null, h('td', null, h('b', null, SKILL_AR[i]), h('div', { class: 'muted en' }, SKILL_EN[i] + ' • XP ' + x.xp)), h('td', null, lv), h('td', null, p5, p10 ? h('div', { style: { marginTop: '4px' } }, p10) : null));
    })));
    card.append(h('h3', null, 'المهارات'), tbl);
    const profInfo = profs.map(p => W.prof[p]).filter(Boolean);
    if (profInfo.length) card.append(h('div', { class: 'muted', style: { marginTop: '6px' } }, profInfo.map(p => h('div', null, '⭐ ', h('b', null, p[1]), ' (', h('span', { class: 'en' }, p[0]), '): ', p[2]))));
    // backpack, mine, health
    const bag = h('select', { onchange: e => App.change(() => { s.setMaxItems(el, +e.target.value); App.render(); }) }, [12, 24, 36].map(n => h('option', { value: n, selected: s.maxItems(el) === n }, n + ' خانة')));
    const mine = h('input', { type: 'number', min: 0, max: 120, value: H.num(el, 'deepestMineLevel'), style: { width: '90px' } });
    const hp = h('input', { type: 'number', min: 100, max: 500, value: H.num(el, 'maxHealth'), style: { width: '90px' } });
    const en = h('input', { type: 'number', min: 50, max: 508, value: H.num(el, 'maxStamina'), style: { width: '90px' } });
    card.append(h('h3', null, 'أشياء ثانية'), h('div', { class: 'row' },
      h('div', { class: 'field' }, h('label', null, 'الشنطة'), bag),
      h('div', { class: 'field' }, h('label', null, 'أعمق طابق بالمنجم'), h('div', { class: 'row' }, mine, h('button', { class: 'btn btn-small', onclick: () => App.change(() => { s.setDeepestMine(el, +mine.value); App.toast('تمام'); }) }, 'طبّق'))),
      h('div', { class: 'field' }, h('label', null, 'الصحة القصوى'), h('div', { class: 'row' }, hp, h('button', { class: 'btn btn-small', onclick: () => App.change(() => { H.setTxt(el, 'maxHealth', +hp.value); H.setTxt(el, 'health', +hp.value); s.touch(); App.toast('تمام'); }) }, 'طبّق'))),
      h('div', { class: 'field' }, h('label', null, 'الطاقة القصوى'), h('div', { class: 'row' }, en, h('button', { class: 'btn btn-small', onclick: () => App.change(() => { H.setTxt(el, 'maxStamina', +en.value); if (H.kid(el, 'stamina')) H.setTxt(el, 'stamina', +en.value); s.touch(); App.toast('تمام'); }) }, 'طبّق')))));
    // equipment
    const eq = [['hat', 'القبعة', ['H']], ['shirtItem', 'القميص', ['S']], ['pantsItem', 'البنطلون', ['P']], ['boots', 'الحذاء', ['B']]];
    card.append(h('h3', null, 'الملابس'), h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr', gap: '8px' } }, eq.map(([slot, label, kinds]) => {
      const cur = s.equipped(el, slot);
      return h('div', { class: 'wood-s', style: { padding: '4px', display: 'flex', gap: '8px', alignItems: 'center' } },
        cur ? App.icon(cur.qid, 32) : h('span', { class: 'ico blank' }),
        h('div', { style: { flex: 1, minWidth: 0 } }, h('b', { style: { fontSize: '13px' } }, label), h('div', { class: 'en', style: { fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, cur ? (BYID[cur.qid] ? BYID[cur.qid].en : cur.name) : '—')),
        h('button', { class: 'btn btn-small', onclick: () => App.pickItem({ kinds, noStack: true, title: 'اختار ' + label }, qid => App.change(() => { s.equip(el, slot, qid); App.render(); })) }, 'غيّر'),
        cur ? h('button', { class: 'btn btn-small btn-red', title: 'شيله', onclick: () => App.change(() => { s.equip(el, slot, null); App.render(); }) }, '✕') : null);
    })));
    grid.append(card);
  }
  pg.append(grid);
};

App.pages.inv = (pg) => {
  const h = App.h, s = App.st.save; const f = App.farmer();
  pg.append(h('h2', null, 'الشنطة والصناديق'), App.farmerSelect());
  pg.append(h('h3', null, '🎒 شنطة ' + f.name), h('div', { class: 'muted' }, 'اضغط على أي خانة عشان تعدّلها أو تحط فيها غرض.'), App.slotGrid(H.kid(f.el, 'items')));
  pg.append(h('h3', null, '📦 الصناديق'));
  const chests = s.chests();
  if (!chests.length) pg.append(h('div', { class: 'muted' }, 'ما في صناديق.'));
  const LOC_AR = { Farm: 'المزرعة', FarmHouse: 'البيت', Cabin: 'الكوخ', Coop: 'القن', Barn: 'الحظيرة', Shed: 'المخزن', Greenhouse: 'البيت الزجاجي', Cellar: 'القبو' };
  const wrap = h('div', { class: 'chestlist' });
  for (const c of chests) {
    const col = s.chestColor(c.el);
    const sw = c.fridge ? null : h('div', { class: 'swatches' }, SDV.CHEST_COLORS.map(rgb => h('span', { class: 'sw' + (rgb[0] === col[0] && rgb[1] === col[1] && rgb[2] === col[2] ? ' sel' : ''), title: rgb.join(','), style: { background: rgb.join(',') === '0,0,0' ? 'linear-gradient(135deg,#c9883f,#8a5a2b)' : `rgb(${rgb})` }, onclick: () => App.change(() => { s.setChestColor(c.el, rgb); App.render(); }) })));
    const count = H.kids(c.items, 'Item').filter(e => !H.isNil(e)).length;
    wrap.append(h('div', { class: 'wood chestbox' },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } },
        h('div', null, h('b', null, c.fridge ? '🧊 الثلاجة' : (c.kind === 'BigChest' || c.kind === 'BigStoneChest' ? '📦 صندوق كبير' : '📦 صندوق')), ' — ', LOC_AR[c.loc] || c.loc, c.x >= 0 ? h('span', { class: 'muted en' }, ` (${c.x}, ${c.y})`) : null, h('span', { class: 'pill', style: { marginRight: '8px' } }, count + ' غرض'),
          c.x >= 0 && c.loc === 'Farm' ? h('button', { class: 'btn btn-small', style: { marginRight: '8px' }, onclick: () => { App.st.tab = 'map'; App.st.mapFocus = [c.x, c.y]; App.render(); } }, '🗺️ وين؟') : null),
        sw),
      App.slotGrid(c.items, { chest: true })));
  }
  pg.append(wrap);
};

App.pages.social = (pg) => {
  const h = App.h, s = App.st.save; const f = App.farmer();
  pg.append(h('h2', null, 'العلاقات'), App.farmerSelect());
  const fr = s.friendships(f.el); const have = new Set(fr.map(x => x.npc));
  const rows = fr.map(x => {
    const n = W.npcs[x.npc]; const pts = h('input', { type: 'number', min: 0, max: 3750, value: x.points, style: { width: '90px' } });
    const max = n && n.datable ? (x.status === 'Married' ? 14 : 10) : 10;
    return h('tr', null, h('td', null, h('b', null, n ? n.ar : x.npc), h('div', { class: 'muted en' }, x.npc)),
      h('td', null, App.hearts(x.points, max, 250, v => App.change(() => { s.setFriendship(f.el, x.npc, v); App.render(); }))),
      h('td', null, h('div', { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } }, pts, h('button', { class: 'btn btn-small', onclick: () => App.change(() => { s.setFriendship(f.el, x.npc, +pts.value); App.render(); }) }, '✓'))),
      h('td', { class: 'muted' }, x.status === 'Dating' ? 'مواعدة' : x.status === 'Married' ? 'متزوجين' : ''));
  });
  pg.append(h('div', { class: 'muted' }, 'كل قلب = 250 نقطة. اضغط على القلوب عشان تغيّرها. (أكثر من 8 قلوب مع العزّاب بدها باقة ورد باللعبة)'));
  pg.append(h('table', null, h('thead', null, h('tr', null, h('th', null, 'الشخصية'), h('th', null, 'القلوب'), h('th', null, 'النقاط'), h('th', null, ''))), h('tbody', null, rows)));
  const missing = Object.entries(W.npcs).filter(([k, v]) => v.social && !have.has(k));
  if (missing.length) {
    const sel = h('select', null, missing.map(([k, v]) => h('option', { value: k }, v.ar + ' (' + k + ')')));
    pg.append(h('h3', null, 'ضيف شخصية لسا ما تعرفت عليها'), h('div', { class: 'row' }, sel, h('button', { class: 'btn btn-small', onclick: () => App.change(() => { s.setFriendship(f.el, sel.value, 0); App.render(); }) }, 'ضيف')));
  }
  const pets = s.pets();
  if (pets.length) {
    pg.append(h('h3', null, '🐾 الحيوان الأليف'));
    for (const p of pets) pg.append(h('div', { class: 'row' }, h('b', null, p.name), h('span', { class: 'muted' }, p.type === 'Cat' ? 'قطة' : p.type === 'Dog' ? 'كلب' : p.type), App.hearts(p.points, 5, 200, v => App.change(() => { s.setPetFriendship(p.el, v); App.render(); })), h('span', { class: 'muted' }, p.points + ' / 1000')));
  }
};

App.pages.cc = (pg) => {
  const h = App.h, s = App.st.save; const B = s.bundles();
  pg.append(h('h2', null, 'المركز المجتمعي (البندلز)'));
  if (!B) { pg.append(h('div', { class: 'muted' }, 'ما لقيت المركز المجتمعي بهاد السيف.')); return; }
  pg.append(h('div', { class: 'muted' }, 'اضغط على أي قطعة عشان تعلّمها مسلّمة أو لا. الأغراض اللي جوّا البندل ما بترجع للشنطة.'));
  const rooms = {}; B.list.forEach(b => (rooms[b.room] = rooms[b.room] || []).push(b));
  const grid = h('div', { class: 'rooms' });
  for (const [room, list] of Object.entries(rooms)) {
    const box = h('div', { class: 'wood' }, h('h3', { style: { marginTop: 0 } }, W.roomAr[room] || room, ' ', h('span', { class: 'muted en' }, room)));
    for (const b of list) {
      const doneCount = b.done.filter(Boolean).length; const complete = b.boolEls.length && b.boolEls.every(e => e.textContent === 'true');
      const rewardPending = b.rewardEl && b.rewardEl.textContent === 'true';
      const rp = b.reward ? b.reward.split(' ') : []; let rewardQ = null;
      if (rp.length >= 2) { const map = { O: '(O)', BO: '(BC)', R: '(O)', F: '(F)' }; rewardQ = (map[rp[0]] || '(O)') + rp[1]; }
      box.append(h('div', { class: 'bundle' + (complete ? ' done' : '') },
        h('div', { class: 'head' }, h('span', null, (complete ? '✅ ' : '') + (W.bundleAr[b.name] || b.display), ' ', h('span', { class: 'muted en', style: { fontSize: '12px' } }, b.display)), h('span', { class: 'pill' }, `${doneCount}/${b.need}`)),
        h('div', { class: 'ings' }, b.ings.map((g, j) => {
          const q = g.id === '-1' ? 'MONEY' : (g.id.startsWith('(') ? g.id : '(O)' + g.id);
          return h('span', { class: 'ing' + (b.done[j] ? ' on' : ''), title: g.id === '-1' ? g.count + 'g' : App.itemName(q), onclick: () => App.change(() => { s.setIngredient(b, j, !b.done[j]); App.render(); }) }, App.icon(q, 22), g.id === '-1' ? g.count.toLocaleString() + 'g' : h('span', { class: 'en' }, App.itemName(q)), g.count > 1 && g.id !== '-1' ? '×' + g.count : '', g.quality ? ' ⭐' : '');
        })),
        h('div', { class: 'row', style: { marginTop: '6px', gap: '6px' } },
          rewardQ ? h('span', { class: 'muted', style: { display: 'flex', alignItems: 'center', gap: '4px' } }, 'الجائزة:', App.icon(rewardQ, 20), h('span', { class: 'en' }, App.itemName(rewardQ)), ' ×' + (rp[2] || 1)) : null,
          complete ? h('select', { onchange: e => App.change(() => { b.rewardEl.textContent = e.target.value; s.touch(); App.render(); }) }, h('option', { value: 'false', selected: !rewardPending }, 'الجائزة مستلمة'), h('option', { value: 'true', selected: rewardPending }, 'الجائزة لسا بالمركز')) : null,
          !complete ? h('button', { class: 'btn btn-small btn-green', onclick: () => App.change(() => { s.completeBundle(b, true); App.render(); App.toast('اكتمل البندل. الجائزة بتلاقيها بالمركز.'); }) }, 'كمّله') : h('button', { class: 'btn btn-small btn-red', onclick: () => App.change(() => { s.resetBundle(b); App.render(); }) }, 'صفّره'))));
    }
    grid.append(box);
  }
  pg.append(grid);
};

App.pages.animals = (pg) => {
  const h = App.h, s = App.st.save; const list = s.animals();
  pg.append(h('h2', null, 'الحيوانات'));
  const TYPE_AR = { 'White Chicken': 'دجاجة بيضاء', 'Brown Chicken': 'دجاجة بنية', 'Blue Chicken': 'دجاجة زرقاء', 'Void Chicken': 'دجاجة الفراغ', 'Golden Chicken': 'دجاجة ذهبية', Duck: 'بطة', Rabbit: 'أرنب', Dinosaur: 'ديناصور', 'White Cow': 'بقرة بيضاء', 'Brown Cow': 'بقرة بنية', Goat: 'ماعز', Sheep: 'خروف', Pig: 'خنزير', Ostrich: 'نعامة' };
  if (!list.length) { pg.append(h('div', { class: 'muted' }, 'ما في حيوانات بالمزرعة لسا.')); return; }
  pg.append(h('table', null, h('thead', null, h('tr', null, h('th', null, 'الاسم'), h('th', null, 'النوع'), h('th', null, 'العمر'), h('th', null, 'الصداقة'), h('th', null, 'السعادة'))), h('tbody', null, list.map(a => {
    const nm = h('input', { type: 'text', value: a.name, style: { width: '140px' }, onchange: e => App.change(() => { s.setAnimal(a.el, 'name', e.target.value); }) });
    const age = h('input', { type: 'number', min: 0, value: a.age, style: { width: '80px' }, onchange: e => App.change(() => { s.setAnimal(a.el, 'age', +e.target.value); }) });
    const hap = h('input', { type: 'range', min: 0, max: 255, value: a.happiness, onchange: e => App.change(() => { s.setAnimal(a.el, 'happiness', +e.target.value); }) });
    return h('tr', null, h('td', null, nm), h('td', null, TYPE_AR[a.type] || a.type, h('div', { class: 'muted' }, a.loc)), h('td', null, age, ' يوم'), h('td', null, App.hearts(a.friendship, 5, 200, v => App.change(() => { s.setAnimal(a.el, 'friendshipTowardFarmer', v); App.render(); }))), h('td', null, hap));
  }))));
};

App.pages.date = (pg) => {
  const h = App.h, s = App.st.save; const d = s.date();
  const day = h('input', { type: 'number', min: 1, max: 28, value: d.day, style: { width: '90px' } });
  const sea = h('select', null, SEASON_AR.map((n, i) => h('option', { value: i, selected: i === d.season }, n)));
  const yr = h('input', { type: 'number', min: 1, max: 99, value: d.year, style: { width: '90px' } });
  pg.append(h('h2', null, 'التاريخ'),
    h('div', { class: 'notice' }, 'لو غيّرت الموسم: الزرع اللي مش من موسمه بيموت بأول ليلة بتنام فيها، والزرع ما بيكبر لحاله لما تقفز أيام.'),
    h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', null, 'اليوم'), day), h('div', { class: 'field' }, h('label', null, 'الموسم'), sea), h('div', { class: 'field' }, h('label', null, 'السنة'), yr),
      h('button', { class: 'btn btn-green', style: { alignSelf: 'flex-end' }, onclick: () => App.change(() => { const dd = Math.max(1, Math.min(28, +day.value)); const delta = s.setDate(dd, +sea.value, Math.max(1, +yr.value)); App.render(); App.toast('تمام' + (delta ? ` (${delta > 0 ? '+' : ''}${delta} يوم)` : '')); }) }, 'طبّق')));
};

// ---------- boot ----------
document.getElementById('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; App.st.tab = b.dataset.tab; App.render(); });
document.getElementById('btnOpen').onclick = () => App.openFolder();
document.getElementById('btnSave').onclick = () => App.st.uploadMode ? App.downloadZip() : App.writeSave();
document.getElementById('btnUndo').onclick = () => App.undo();
document.getElementById('modalX').onclick = () => App.closeModal();
document.getElementById('modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') App.closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') App.closeModal(); if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); App.undo(); } });
window.addEventListener('beforeunload', e => { if (App.st.save && App.st.save.dirty) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('DOMContentLoaded', () => App.render());
