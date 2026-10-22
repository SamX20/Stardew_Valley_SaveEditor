/* وضع الرفع: أي حدا بيرفع ملفات سيفه، بيعدّل، وبينزّلها zip — بدون صلاحيات مجلدات */
'use strict';
(function () {
  const h = (...a) => App.h(...a);
  // ---------- tiny zip (store) writer + reader ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function makeZip(files) { // [{name, data:Uint8Array}]
    const enc = new TextEncoder(); const parts = []; const central = []; let off = 0;
    const d = new Date(); const dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(); const tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    for (const f of files) {
      const nm = enc.encode(f.name); const crc = crc32(f.data); const sz = f.data.length;
      const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, tm, true); lh.setUint16(12, dt, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nm, f.data);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, tm, true); ch.setUint16(14, dt, true); ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nm);
      off += 30 + nm.length + sz;
    }
    const csize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }
  async function readZip(buf) {
    const u = new Uint8Array(buf); const dv = new DataView(buf); const out = [];
    let e = u.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('ملف الـ zip مش سليم');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const dec = new TextDecoder();
    for (let i = 0; i < n; i++) {
      const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = dec.decode(u.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      const lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true); const start = lo + 30 + lnl + lxl; const raw = u.subarray(start, start + csz);
      let data;
      if (method === 0) data = raw;
      else if (method === 8) { const ds = new DecompressionStream('deflate-raw'); data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer()); }
      else continue;
      out.push({ name, data });
    }
    return out;
  }
  App.zip = { makeZip, readZip };
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
  App.download = download;
  // ---------- load uploaded files ----------
  async function loadFiles(list) {
    let files = [];
    for (const f of list) {
      if (/\.zip$/i.test(f.name)) { for (const z of await readZip(await f.arrayBuffer())) files.push({ name: z.name.split('/').pop(), path: z.name, data: z.data }); }
      else files.push({ name: f.name, path: f.webkitRelativePath || f.name, data: new Uint8Array(await f.arrayBuffer()) });
    }
    files = files.filter(f => f.name && !/editor_backups|_old$/.test(f.path));
    const dec = new TextDecoder();
    const head = f => dec.decode(f.data.subarray(0, 600));
    const main = files.find(f => head(f).includes('<SaveGame'));
    const info = files.find(f => f.name === 'SaveGameInfo' && head(f).includes('<Farmer'));
    if (!main) throw new Error('ما لقيت ملف السيف. اختار مجلد السيف كامل، أو الملف اللي اسمه متل المجلد (مثلاً Jaber_451924465).');
    if (App.st.save && App.st.save.dirty && !confirm('في تعديلات مش محفوظة. بدك تكمل وتتجاهلها؟')) return;
    App.st.save = new SDV.Save(dec.decode(main.data), info ? dec.decode(info.data) : null);
    App.st.uploadMode = { name: main.name }; App.st.saveName = main.name; App.st.saveDir = null; App.st.undo = [];
    App.st.farmerUid = SDV.helpers.txt(App.st.save.player(), 'UniqueMultiplayerID');
    document.getElementById('btnUndo').disabled = true; App.markDirty(); App.st.tab = 'players'; App.render();
    App.toast('فتحت السيف اللي رفعته: ' + App.label());
  }
  App.openUpload = function () {
    const dirIn = h('input', { type: 'file', webkitdirectory: true, style: { display: 'none' } });
    const fileIn = h('input', { type: 'file', multiple: true, style: { display: 'none' } });
    const go = async e => { try { App.closeModal(); await loadFiles([...e.target.files]); } catch (err) { App.toast(err.message, true); } };
    dirIn.onchange = go; fileIn.onchange = go;
    App.modal(h('div', null, h('h2', null, '📤 ارفع سيف من جهازك'),
      h('p', null, 'بتعدّل عليه هون، ولما تخلص بتنزّله zip وبترجّعه لمجلد السيفات عندك. ما بنرفع إشي لأي سيرفر، كل الشغل بيصير بالمتصفح.'),
      h('div', { class: 'notice' }, 'مكان السيفات على ويندوز: ', h('code', { class: 'en' }, '%AppData%\\StardewValley\\Saves'), '. إذا المتصفح ما قبل يفتح المجلد، انسخ مجلد السيف لسطح المكتب واختاره من هناك، أو اضغطه zip وارفعه.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => dirIn.click() }, '📁 اختار مجلد السيف'), h('button', { class: 'btn btn-blue', onclick: () => fileIn.click() }, '🗂️ اختار الملفات أو zip')),
      dirIn, fileIn));
  };
  App.downloadZip = function () {
    const s = App.st.save; if (!s) return; const name = App.st.uploadMode.name; const enc = new TextEncoder();
    const blob = makeZip([{ name: `${name}/${name}`, data: enc.encode(s.serialize()) }, { name: `${name}/SaveGameInfo`, data: enc.encode(s.serializeInfo()) }]);
    download(blob, name + '.zip'); s.dirty = false; App.markDirty();
    App.modal(h('div', null, h('h2', null, '✔ نزل الملف ' + name + '.zip'),
      h('ol', { style: { lineHeight: 2 } }, h('li', null, 'سكّر اللعبة.'), h('li', null, 'افتح مجلد السيفات: ', h('code', { class: 'en' }, '%AppData%\\StardewValley\\Saves')), h('li', null, 'خذ نسخة احتياطية من مجلد ', h('b', { class: 'en' }, name), ' (انسخه لمكان ثاني).'), h('li', null, 'فك الضغط عن الـ zip جوّا مجلد Saves، ووافق على استبدال الملفات.'), h('li', null, 'افتح اللعبة.'))));
  };
})();
