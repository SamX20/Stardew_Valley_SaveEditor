/* خريطة المزرعة — عرض وتعديل */
'use strict';
(function () {
  const h = (...a) => App.h(...a);
  const IMG = {}; const T = 16;
  function img(name) { if (!IMG[name]) { const i = new Image(); i.src = name; i.onload = () => Map2.draw(); IMG[name] = i; } return IMG[name]; }
  const SPR = { 599: 'sprinkler', 621: 'quality', 645: 'iridium' };
  const M = window.Map2 = { zoom: 2, tool: 'select', sel: [], placeQid: null, seedQid: null, showSpr: true, showGrid: false, showScare: false, drag: null, hover: null, ents: [] };

  function season() { const s = App.st.save; return s ? Math.max(0, s.date().season) : 0; }
  function farm() { return App.st.save.farm(); }
  function refresh() { M.ents = App.st.save.mapEntities(farm()); }

  // ---------- drawing ----------
  function px(n) { return n * T * M.zoom; }
  function drawSprite(ctx, im, sx, sy, sw, sh, tx, ty, opts) {
    if (!im || !im.complete || !im.naturalWidth) return;
    ctx.save(); if (opts && opts.alpha != null) ctx.globalAlpha = opts.alpha;
    const dx = tx * T * M.zoom, dy = ty * T * M.zoom, dw = sw * M.zoom, dh = sh * M.zoom;
    if (opts && opts.flip) { ctx.translate(dx + dw, dy); ctx.scale(-1, 1); ctx.drawImage(im, sx, sy, sw, sh, 0, 0, dw, dh); }
    else ctx.drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  }
  function objIdx(e) { const p = App.helpers ? null : null; const ps = SDV.helpers.txt(e.o, 'parentSheetIndex'); const n = Number(ps); return isNaN(n) ? Number(e.id) : n; }
  function drawObj(ctx, e) {
    const H = SDV.helpers; const o = e.o; const id = e.id;
    if (e.big) {
      const it = BYIDX('(BC)' + id); const im = img('assets/sheets/' + ((it && it.s && it.s[0]) || 'Craftables') + '.png');
      const idx = it && it.s ? it.s[1] : objIdx(e); const cols = 8;
      drawSprite(ctx, im, (idx % cols) * 16, Math.floor(idx / cols) * 32, 16, 32, e.x, e.y - 1);
      if (e.type === 'Chest') { const c = App.st.save.chestColor(o); if (c[3]) { const ctx2 = ctx; ctx2.save(); ctx2.globalAlpha = .45; ctx2.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx2.fillRect(px(e.x) + 2 * M.zoom, px(e.y) - 8 * M.zoom, 12 * M.zoom, 18 * M.zoom); ctx2.restore(); } }
      return;
    }
    const it = BYIDX('(O)' + id); const sheet = (it && it.s && it.s[0]) || 'springobjects'; const im = img('assets/sheets/' + sheet + '.png');
    const idx = it && it.s ? it.s[1] : objIdx(e); const cols = sheet === 'Objects_2' ? 8 : 24;
    drawSprite(ctx, im, (idx % cols) * 16, Math.floor(idx / cols) * 16, 16, 16, e.x, e.y);
  }
  function BYIDX(q) { return window.SDV_ITEMS_BY || (window.SDV_ITEMS_BY = Object.fromEntries(SDV_ITEMS.map(i => [i.id, i])), window.SDV_ITEMS_BY), window.SDV_ITEMS_BY[q]; }
  function drawTF(ctx, e) {
    const H = SDV.helpers; const t = e.t; const z = M.zoom;
    if (e.type === 'HoeDirt') {
      const wet = H.num(t, 'state') === 1;
      ctx.fillStyle = wet ? 'rgba(70,40,18,.85)' : 'rgba(138,90,43,.8)'; ctx.fillRect(px(e.x) + z, px(e.y) + z, T * z - 2 * z, T * z - 2 * z);
      if (H.txt(t, 'fertilizer')) { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(px(e.x) + 3 * z, px(e.y) + 3 * z, 2 * z, 2 * z); }
      const c = H.kid(t, 'crop');
      if (c) {
        const row = H.num(c, 'rowInSpriteSheet'); const full = H.txt(c, 'fullGrown') === 'true'; const ph = H.num(c, 'currentPhase'); const dead = H.txt(c, 'dead') === 'true';
        let sx, sy;
        if (dead) { sx = 192; sy = 384; } else { const f = full ? (H.num(c, 'dayOfCurrentPhase') <= 0 ? 6 : 7) : ph + 1; sx = Math.min(240, f * 16 + (row % 2 ? 128 : 0)); sy = Math.floor(row / 2) * 32; }
        drawSprite(ctx, img('assets/sheets/crops.png'), sx, sy, 16, 32, e.x, e.y - 1, { flip: H.txt(c, 'flip') === 'true' });
      }
    } else if (e.type === 'Flooring') {
      const wf = H.txt(t, 'whichFloor'); const f = W.floors[wf];
      if (f && f.tex === 'Flooring') drawSprite(ctx, img('assets/sheets/Flooring.png'), f.corner.X, f.corner.Y, 16, 16, e.x, e.y); else { ctx.fillStyle = 'rgba(200,180,140,.7)'; ctx.fillRect(px(e.x), px(e.y), T * z, T * z); }
    } else if (e.type === 'Grass') {
      drawSprite(ctx, img('assets/sheets/grass.png'), 0, 0, 15, 20, e.x, e.y - .25, { alpha: .95 });
    } else if (e.type === 'Tree') {
      const tt = H.txt(t, 'treeType'); const st = H.num(t, 'growthStage'); const stump = H.txt(t, 'stump') === 'true';
      const sea = ['spring', 'spring', 'fall', 'winter'][season()];
      const tex = ['1', '2', '3'].includes(tt) ? `assets/sheets/tree${tt}_${sea}.png` : null;
      if (!tex) { ctx.fillStyle = '#2f6b2a'; ctx.beginPath(); ctx.arc(px(e.x) + 8 * z, px(e.y) + 2 * z, (st >= 5 ? 14 : 6) * z, 0, 7); ctx.fill(); return; }
      const im = img(tex); const flip = H.txt(t, 'flipped') === 'true';
      if (st >= 5) { drawSprite(ctx, im, 32, 96, 16, 32, e.x, e.y - 1, { flip }); if (!stump && im.naturalWidth >= 48) drawSprite(ctx, im, 0, 0, 48, 96, e.x - 1, e.y - 5, { flip, alpha: M.tool === 'select' ? .9 : .55 }); }
      else if (st >= 3) drawSprite(ctx, im, 0, 96, 16, 32, e.x, e.y - 1, { flip });
      else { const r = st === 0 ? [32, 128] : st === 1 ? [0, 128] : [16, 128]; drawSprite(ctx, im, r[0], r[1], 16, 16, e.x, e.y, { flip }); }
    } else if (e.type === 'FruitTree') {
      const tt = H.txt(t, 'treeId') || H.txt(t, 'treeType'); const ft = W.fruitTrees[tt]; const st = H.num(t, 'growthStage');
      const row = ft ? ft.idx : 0; const im = img('assets/sheets/fruitTrees.png');
      const col = st >= 4 ? 4 + season() : Math.max(0, st);
      drawSprite(ctx, im, col * 48, row * 80, 48, 80, e.x - 1, e.y - 4, { alpha: M.tool === 'select' ? .95 : .6 });
    } else { ctx.fillStyle = 'rgba(120,200,120,.5)'; ctx.fillRect(px(e.x), px(e.y), T * z, T * z); }
  }
  function drawClump(ctx, e) { const idx = e.idx; drawSprite(ctx, img('assets/sheets/springobjects.png'), (idx % 24) * 16, Math.floor(idx / 24) * 16, 32, 32, e.x, e.y); }
  function drawBush(ctx, e) { const z = M.zoom; ctx.save(); ctx.fillStyle = '#3c7a2a'; ctx.strokeStyle = '#1f4313'; ctx.lineWidth = 2; const w = e.w * T * z; ctx.beginPath(); ctx.ellipse(px(e.x) + w / 2, px(e.y) + 4 * z, w / 2, 11 * z, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }
  function drawBld(ctx, e) {
    const H = SDV.helpers; const z = M.zoom; const b = W.buildings[e.type] || {};
    let tex = b.tex || e.type; const skin = H.txt(SDV.helpers.kid(e.el, 'skinId'), 'string'); if (skin) tex = skin;
    if (e.type === 'Farmhouse') tex = 'houses';
    const im = img('assets/buildings/' + tex + '.png');
    if (im.complete && im.naturalWidth) {
      let sx = 0, sy = 0, sw = im.naturalWidth, sh = im.naturalHeight;
      if (b.src && b.src.Width) { sx = b.src.X; sy = b.src.Y; sw = b.src.Width; sh = b.src.Height; }
      else if (tex === 'houses') { sw = 160; sh = 144; }
      else if (/Cabin/.test(tex)) { sw = 80; sh = 112; }
      else if (tex === 'Greenhouse') { sw = 112; sh = 160; }
      drawSprite(ctx, im, sx, sy, sw, sh, e.x, e.y + e.h - sh / 16);
    } else { ctx.fillStyle = 'rgba(140,90,40,.8)'; ctx.fillRect(px(e.x), px(e.y), e.w * T * z, e.h * T * z); }
  }
  function sprinklerTiles(e) {
    const kind = SPR[e.id]; if (!kind || e.big) return [];
    const r = kind === 'sprinkler' ? 1 : kind === 'quality' ? 1 : 2; const out = [];
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { if (!dx && !dy) continue; if (kind === 'sprinkler' && Math.abs(dx) + Math.abs(dy) !== 1) continue; out.push([e.x + dx, e.y + dy]); }
    return out;
  }
  M.draw = function () {
    const cv = document.getElementById('mapCanvas'); if (!cv || !App.st.save) return;
    const z = M.zoom; cv.width = 80 * T * z; cv.height = 65 * T * z; const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const bg = img(`assets/farm_${['spring', 'summer', 'fall', 'winter'][season()]}.png`);
    if (bg.complete && bg.naturalWidth) ctx.drawImage(bg, 0, 0, cv.width, cv.height); else { ctx.fillStyle = '#5b8a3a'; ctx.fillRect(0, 0, cv.width, cv.height); }
    const ents = M.ents;
    const covered = new Set();
    if (M.showSpr) for (const e of ents) if (e.kind === 'obj') for (const [x, y] of sprinklerTiles(e)) covered.add(x + ',' + y);
    if (M.showScare) { ctx.save(); ctx.fillStyle = 'rgba(255,220,80,.13)'; ctx.strokeStyle = 'rgba(255,200,40,.7)'; for (const e of ents) if (e.kind === 'obj' && /arecrow|Rarecrow/.test(e.name || '')) { const r = (e.name === 'Deluxe Scarecrow' ? 16 : 8) + .5; ctx.beginPath(); ctx.arc(px(e.x + .5), px(e.y + .5), r * T * z, 0, 7); ctx.fill(); ctx.stroke(); } ctx.restore(); }
    const order = [...ents].sort((a, b) => { const ra = a.kind === 'tf' && (a.type === 'HoeDirt' || a.type === 'Flooring') ? 0 : 1, rb = b.kind === 'tf' && (b.type === 'HoeDirt' || b.type === 'Flooring') ? 0 : 1; if (ra !== rb) return ra - rb; return (a.y + a.h) - (b.y + b.h); });
    // flat layer first (dirt/floor), then the rest sorted by y
    for (const e of order) { if (e.kind === 'tf' && (e.type === 'HoeDirt' || e.type === 'Flooring')) drawTF(ctx, Object.assign({}, e, { type: e.type === 'HoeDirt' ? 'DirtOnly' : e.type })); }
    if (M.showSpr && covered.size) { ctx.fillStyle = 'rgba(80,170,255,.38)'; for (const k of covered) { const [x, y] = k.split(',').map(Number); ctx.fillRect(px(x), px(y), T * z, T * z); } }
    for (const e of order) {
      if (e.kind === 'tf') { if (e.type === 'HoeDirt') drawTF(ctx, e); else if (e.type !== 'Flooring') drawTF(ctx, e); }
      else if (e.kind === 'obj') drawObj(ctx, e); else if (e.kind === 'clump') drawClump(ctx, e); else if (e.kind === 'ltf') drawBush(ctx, e); else if (e.kind === 'bld') drawBld(ctx, e);
    }
    if (M.showSpr) { ctx.save(); ctx.strokeStyle = 'rgba(255,60,40,.9)'; ctx.lineWidth = Math.max(1, z); for (const e of ents) if (e.kind === 'tf' && e.type === 'HoeDirt' && SDV.helpers.kid(e.t, 'crop') && !covered.has(e.x + ',' + e.y)) ctx.strokeRect(px(e.x) + z, px(e.y) + z, T * z - 2 * z, T * z - 2 * z); ctx.restore(); }
    if (M.showGrid) { ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; for (let x = 0; x <= 80; x++) { ctx.beginPath(); ctx.moveTo(px(x), 0); ctx.lineTo(px(x), cv.height); ctx.stroke(); } for (let y = 0; y <= 65; y++) { ctx.beginPath(); ctx.moveTo(0, px(y)); ctx.lineTo(cv.width, px(y)); ctx.stroke(); } }
    // selection
    ctx.lineWidth = 2 * z;
    for (const e of M.sel) { ctx.strokeStyle = '#ffe14d'; ctx.strokeRect(px(e.x), px(e.y), e.w * T * z, e.h * T * z); }
    if (M.drag && M.drag.mode === 'move') {
      const dx = M.drag.cur[0] - M.drag.start[0], dy = M.drag.cur[1] - M.drag.start[1];
      for (const e of M.sel) { ctx.fillStyle = M.drag.ok ? 'rgba(120,255,120,.35)' : 'rgba(255,80,60,.4)'; ctx.fillRect(px(e.x + dx), px(e.y + dy), e.w * T * z, e.h * T * z); }
    }
    if (M.drag && M.drag.mode === 'box') { const [a, b] = [M.drag.start, M.drag.cur]; ctx.strokeStyle = '#fff'; ctx.setLineDash([6, 4]); ctx.strokeRect(px(Math.min(a[0], b[0])), px(Math.min(a[1], b[1])), px(Math.abs(a[0] - b[0]) + 1), px(Math.abs(a[1] - b[1]) + 1)); ctx.setLineDash([]); }
    if (M.hover && ['place', 'plant', 'till', 'water', 'delete', 'ready'].includes(M.tool)) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * z; ctx.strokeRect(px(M.hover[0]), px(M.hover[1]), T * z, T * z); }
  };
  // Override: flat dirt draw without crop
  const _drawTF = drawTF;
  drawTF = function (ctx, e) { if (e.type === 'DirtOnly') { const H = SDV.helpers; const z = M.zoom; const wet = H.num(e.t, 'state') === 1; ctx.fillStyle = wet ? 'rgba(70,40,18,.85)' : 'rgba(138,90,43,.8)'; ctx.fillRect(px(e.x) + z, px(e.y) + z, T * z - 2 * z, T * z - 2 * z); return; } if (e.type === 'HoeDirt') { const H = SDV.helpers; const c = H.kid(e.t, 'crop'); if (!c) return; const row = H.num(c, 'rowInSpriteSheet'); const full = H.txt(c, 'fullGrown') === 'true'; const ph = H.num(c, 'currentPhase'); const dead = H.txt(c, 'dead') === 'true'; let sx, sy; if (dead) { sx = 192; sy = 384; } else { const f = full ? (H.num(c, 'dayOfCurrentPhase') <= 0 ? 6 : 7) : ph + 1; sx = Math.min(240, f * 16 + (row % 2 ? 128 : 0)); sy = Math.floor(row / 2) * 32; } drawSprite(ctx, img('assets/sheets/crops.png'), sx, sy, 16, 32, e.x, e.y - 1, { flip: H.txt(c, 'flip') === 'true' }); return; } return _drawTF(ctx, e); };

  // ---------- picking ----------
  const PRI = { bld: 5, obj: 4, clump: 3, ltf: 2, tf: 1 };
  function entsAt(x, y) { return M.ents.filter(e => x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h).sort((a, b) => PRI[b.kind] - PRI[a.kind] || (a.type === 'HoeDirt' ? -1 : 0)); }
  function tileOf(ev) { const cv = ev.target; const r = cv.getBoundingClientRect(); return [Math.floor((ev.clientX - r.left) * (cv.width / r.width) / (T * M.zoom)), Math.floor((ev.clientY - r.top) * (cv.height / r.height) / (T * M.zoom))]; }
  function describe(e) {
    const H = SDV.helpers; const s = App.st.save;
    if (e.kind === 'bld') return '🏠 ' + ((W.buildings[e.type] && W.buildings[e.type].name) || e.type);
    if (e.kind === 'obj') { const q = (e.big ? '(BC)' : '(O)') + e.id; const it = BYIDX(q); return (it ? it.en + (it.ar ? ' — ' + it.ar : '') : e.name); }
    if (e.kind === 'clump') return ({ 600: 'جذع شجرة كبير (بدك فأس نحاسي)', 602: 'جذع ضخم (بدك فأس فولاذي)', 672: 'صخرة كبيرة (بدك معول فولاذي)', 752: 'صخرة', 754: 'صخرة', 756: 'صخرة', 758: 'صخرة' }[e.idx] || 'صخرة/جذع كبير');
    if (e.kind === 'ltf') return '🌳 شجيرة';
    if (e.type === 'HoeDirt') {
      const ci = s.cropInfo(e.el); const wet = H.num(e.t, 'state') === 1;
      if (!ci) return 'أرض محروثة' + (wet ? ' (مسقية)' : '');
      const it = BYIDX('(O)' + ci.harvest); const total = ci.phases.length - 1; const ready = ci.phase >= total;
      const left = ready ? 0 : ci.phases.slice(ci.phase, total).reduce((a, b) => a + b, 0) - ci.day;
      return `🌱 ${it ? it.en + ' — ' + (it.ar || '') : ci.harvest}\nالمرحلة ${Math.min(ci.phase + 1, total)}/${total}` + (ready ? ' — جاهز للحصاد ✅' : ` — باقي تقريباً ${left} يوم`) + (wet ? '\n💧 مسقي' : '\nمش مسقي') + (ci.dead ? '\n☠️ ميت' : '') + (ci.fert ? '\nفيه سماد' : '');
    }
    if (e.type === 'Tree') return '🌲 شجرة';
    if (e.type === 'FruitTree') return '🍎 شجرة فاكهة';
    if (e.type === 'Grass') return 'عشب';
    if (e.type === 'Flooring') return 'أرضية/ممر';
    return e.type || e.kind;
  }
  function moveCheck(dx, dy) {
    const s = App.st.save; const loc = farm(); const ignore = M.sel.map(e => e.el);
    for (const e of M.sel) {
      const needDig = e.kind === 'tf' && e.type === 'HoeDirt';
      const err = s.canPlace(loc, e.x + dx, e.y + dy, e.kind === 'bld' ? e.w : 1, e.kind === 'bld' ? e.h : 1, ignore, needDig) || (e.kind === 'bld' ? s.doorCheck(loc, e.el, e.x + dx, e.y + dy, ignore) : null);
      if (err) return err;
    }
    // dirt + object on same tile is allowed for sprinklers? keep simple: forbid overlap among moved items themselves too
    const seen = new Set(); for (const e of M.sel) { if (e.kind === 'bld') continue; const k = (e.x + dx) + ',' + (e.y + dy) + (e.kind === 'tf' ? 't' : 'o'); if (seen.has(k)) return 'تداخل'; seen.add(k); }
    return null;
  }
  function onDown(ev) {
    if (ev.button !== 0) return; const [x, y] = tileOf(ev); const s = App.st.save; const loc = farm();
    if (M.tool === 'select') {
      const hit = entsAt(x, y)[0];
      if (hit && M.sel.includes(hit) && !ev.shiftKey) { M.drag = { mode: 'move', start: [x, y], cur: [x, y], ok: true }; return; }
      if (hit) { if (ev.shiftKey) { M.sel = M.sel.includes(hit) ? M.sel.filter(e => e !== hit) : [...M.sel, hit]; } else M.sel = [hit]; M.drag = { mode: 'move', start: [x, y], cur: [x, y], ok: true }; }
      else { if (!ev.shiftKey) M.sel = []; M.drag = { mode: 'box', start: [x, y], cur: [x, y] }; }
      panel(); M.draw(); return;
    }
    M.drag = { mode: 'paint', done: new Set() }; paintAt(x, y);
  }
  function paintAt(x, y) {
    const k = x + ',' + y; if (M.drag && M.drag.done) { if (M.drag.done.has(k)) return; M.drag.done.add(k); }
    const s = App.st.save; const loc = farm();
    try {
      if (M.tool === 'place') {
        if (!M.placeQid) { App.toast('اختار الغرض أول', true); return; }
        const ex = entsAt(x, y); const onlyDirt = ex.length === 1 && ex[0].kind === 'tf' && ex[0].type === 'HoeDirt' && !SDV.helpers.kid(ex[0].t, 'crop');
        const err = onlyDirt ? null : s.canPlace(loc, x, y, 1, 1, [], false); if (err) { App.toast(err, true); return; }
        App.change(() => { if (onlyDirt) s.removeEntity(ex[0]); s.placeObject(loc, M.placeQid, x, y); });
      } else if (M.tool === 'plant') {
        if (!M.seedQid) { App.toast('اختار البذرة أول', true); return; }
        const ex = entsAt(x, y); const dirt = ex.find(e => e.kind === 'tf' && e.type === 'HoeDirt');
        if (!dirt) { const err = s.canPlace(loc, x, y, 1, 1, [], true); if (err) { App.toast(err, true); return; } }
        else if (SDV.helpers.kid(dirt.t, 'crop')) return;
        App.change(() => s.plant(loc, M.seedQid.replace('(O)', ''), x, y));
      } else if (M.tool === 'till') {
        const err = s.canPlace(loc, x, y, 1, 1, [], true); if (err) { App.toast(err, true); return; }
        App.change(() => s.till(loc, x, y));
      } else if (M.tool === 'water') {
        const dirt = entsAt(x, y).find(e => e.kind === 'tf' && e.type === 'HoeDirt'); if (!dirt) return;
        const on = SDV.helpers.num(dirt.t, 'state') !== 1; App.change(() => s.setWatered(dirt.el, on));
      } else if (M.tool === 'ready') {
        const dirt = entsAt(x, y).find(e => e.kind === 'tf' && e.type === 'HoeDirt' && SDV.helpers.kid(e.t, 'crop')); if (!dirt) return;
        App.change(() => s.makeCropReady(dirt.el));
      } else if (M.tool === 'delete') {
        const hit = entsAt(x, y)[0]; if (!hit) return;
        if (hit.kind === 'bld') { App.toast('ما بنحذف مباني من هون (بتقدر تنقلها بأداة التحديد)', true); return; }
        App.change(() => s.removeEntity(hit));
      }
      refresh(); M.draw(); panel();
    } catch (e) { App.toast(e.message, true); }
  }
  function onMove(ev) {
    const [x, y] = tileOf(ev); M.hover = [x, y];
    const tip = document.getElementById('tip'); const hit = entsAt(x, y);
    if (hit.length && !M.drag) { tip.textContent = hit.slice(0, 2).map(describe).join('\n'); tip.style.whiteSpace = 'pre-line'; tip.style.left = (ev.clientX + 14) + 'px'; tip.style.top = (ev.clientY + 14) + 'px'; tip.classList.remove('hidden'); } else tip.classList.add('hidden');
    if (M.drag) {
      if (M.drag.mode === 'paint') { paintAt(x, y); return; }
      M.drag.cur = [x, y];
      if (M.drag.mode === 'move') { const dx = x - M.drag.start[0], dy = y - M.drag.start[1]; M.drag.ok = !(dx || dy) || !moveCheck(dx, dy); }
      M.draw();
    } else if (['place', 'plant', 'till', 'water', 'delete', 'ready'].includes(M.tool)) M.draw();
  }
  function onUp(ev) {
    if (!M.drag) return; const d = M.drag; M.drag = null;
    if (d.mode === 'box') {
      const [a, b] = [d.start, d.cur]; const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      const add = M.ents.filter(e => e.kind !== 'bld' && e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1 && !(e.kind === 'tf' && (e.type === 'Grass')) && M.boxFilter(e));
      M.sel = ev.shiftKey ? [...new Set([...M.sel, ...add])] : add;
    } else if (d.mode === 'move') {
      const dx = d.cur[0] - d.start[0], dy = d.cur[1] - d.start[1];
      if (dx || dy) {
        const err = moveCheck(dx, dy);
        if (err) App.toast('ما بنفع هون: ' + err, true);
        else { const s = App.st.save; App.change(() => { for (const e of M.sel) s.setEntityPos(e, e.x + dx, e.y + dy); }); App.toast('انتقل ✓'); }
      }
    }
    refresh(); M.sel = M.sel.map(e => M.ents.find(n => n.el === e.el)).filter(Boolean); panel(); M.draw();
  }
  M.boxFilter = e => true;
  // ---------- side panel ----------
  function panel() {
    const p = document.getElementById('selPanel'); if (!p) return; p.innerHTML = '';
    if (!M.sel.length) { p.append(h('div', { class: 'muted' }, 'ما في شي محدد. اضغط على أي شي بالخريطة، أو اسحب مربع عشان تحدد مجموعة. Shift للإضافة.')); return; }
    const counts = {}; for (const e of M.sel) { const k = describe(e).split('\n')[0]; counts[k] = (counts[k] || 0) + 1; }
    p.append(h('b', null, `محدد: ${M.sel.length}`), h('div', { style: { maxHeight: '160px', overflow: 'auto', fontSize: '13px' } }, Object.entries(counts).map(([k, n]) => h('div', null, n > 1 ? `${n}× ` : '', k))));
    if (M.sel.length === 1) p.append(h('div', { class: 'muted', style: { whiteSpace: 'pre-line', marginTop: '4px' } }, describe(M.sel[0])));
    const s = App.st.save;
    const dirts = M.sel.filter(e => e.kind === 'tf' && e.type === 'HoeDirt');
    p.append(h('div', { class: 'row', style: { gap: '6px', marginTop: '8px' } },
      h('button', { class: 'btn btn-small', onclick: () => nudge(0, -1) }, '⬆'), h('button', { class: 'btn btn-small', onclick: () => nudge(0, 1) }, '⬇'), h('button', { class: 'btn btn-small', onclick: () => nudge(1, 0) }, '➡'), h('button', { class: 'btn btn-small', onclick: () => nudge(-1, 0) }, '⬅'),
      dirts.length ? h('button', { class: 'btn btn-small btn-blue', onclick: () => { App.change(() => dirts.forEach(e => s.setWatered(e.el, true))); refresh(); M.draw(); panel(); } }, '💧 اسقي') : null,
      M.sel.some(e => e.kind !== 'bld') ? h('button', { class: 'btn btn-small btn-red', onclick: () => { if (!confirm(`أحذف ${M.sel.filter(e => e.kind !== 'bld').length} شي؟`)) return; App.change(() => M.sel.filter(e => e.kind !== 'bld').forEach(e => s.removeEntity(e))); M.sel = []; refresh(); M.draw(); panel(); } }, '🗑 احذف') : null));
  }
  function nudge(dx, dy) { const err = moveCheck(dx, dy); if (err) { App.toast(err, true); return; } const s = App.st.save; App.change(() => M.sel.forEach(e => s.setEntityPos(e, e.x + dx, e.y + dy))); refresh(); M.sel = M.sel.map(e => M.ents.find(n => n.el === e.el)).filter(Boolean); M.draw(); panel(); }

  // ---------- page ----------
  App.pages.map = (pg) => {
    const s = App.st.save; refresh(); M.sel = [];
    const tools = [['select', '✋ حدّد وانقل', 'اضغط واسحب. Shift للإضافة. اسحب على فراغ لتحديد مجموعة.'], ['place', '📦 حط غرض', 'رشاش، فزاعة، صندوق، آلة…'], ['plant', '🌱 ازرع', 'اختار بذرة وامسح فوق الأرض'], ['till', '⛏ احرث', 'يعمل أرض محروثة'], ['water', '💧 اسقي/نشّف', 'اضغط على الأرض المحروثة'], ['ready', '✨ جهّز للحصاد', 'بخلي النبتة جاهزة'], ['delete', '🗑 احذف', 'يحذف الشي اللي تحت الماوس']];
    const broken = s.brokenFences(farm()).length;
    const presetBtns = [['(O)621', 'رشاش جيد'], ['(O)599', 'رشاش'], ['(O)645', 'رشاش إيريديوم'], ['(BC)8', 'فزاعة'], ['CHEST:130', 'صندوق'], ['(O)322', 'سياج خشب'], ['(O)325', 'بوابة']].map(([q, n]) => h('button', { class: 'chip', onclick: () => { M.placeQid = q; M.tool = 'place'; App.render(); } }, q.startsWith('CHEST') ? App.icon('(BC)130', 18) : App.icon(q, 18), n));
    const toolCol = h('div', { class: 'tools' },
      broken ? h('div', { class: 'sel-panel' }, h('b', null, `⚠️ في ${broken} قطعة سياج/بوابة محطوطة غلط`), h('div', { class: 'muted' }, 'باللعبة بتطلع أيقونة وبتسكّر الطريق بدل ما تتوصل ببعض.'), h('button', { class: 'btn btn-small btn-blue', style: { marginTop: '6px' }, onclick: () => { App.change(() => s.fixFences(farm())); App.toast('صلّحت السياج ✓ احفظ التعديلات'); App.render(); } }, '🔧 صلّحهم')) : null,
      tools.map(([id, label, tip]) => h('button', { class: 'toolbtn' + (M.tool === id ? ' active' : ''), title: tip, onclick: () => { M.tool = id; App.render(); } }, label)),
      M.tool === 'place' ? h('div', { class: 'sel-panel' }, h('b', null, 'الغرض: '), M.placeQid ? h('span', { class: 'row', style: { gap: '6px', display: 'inline-flex' } }, App.icon(M.placeQid.startsWith('CHEST') ? '(BC)130' : M.placeQid, 24), h('span', { class: 'en' }, M.placeQid.startsWith('CHEST') ? 'Chest' : App.itemName(M.placeQid))) : '—', h('div', { class: 'chips', style: { marginTop: '6px' } }, presetBtns), h('button', { class: 'btn btn-small', style: { marginTop: '6px' }, onclick: chooseObj }, 'غرض ثاني…')) : null,
      M.tool === 'plant' ? h('div', { class: 'sel-panel' }, h('b', null, 'البذرة: '), M.seedQid ? h('span', { class: 'row', style: { gap: '6px', display: 'inline-flex' } }, App.icon(M.seedQid, 24), h('span', { class: 'en' }, App.itemName(M.seedQid))) : '—', h('button', { class: 'btn btn-small', style: { marginTop: '6px' }, onclick: chooseSeed }, 'اختار بذرة…'), h('div', { class: 'muted' }, 'بتنزرع بأول مرحلة. انتبه للموسم!')) : null,
      h('label', { class: 'row', style: { gap: '6px' } }, h('input', { type: 'checkbox', checked: M.showSpr, onchange: e => { M.showSpr = e.target.checked; M.draw(); } }), 'وريني مدى الرشاشات'),
      h('label', { class: 'row', style: { gap: '6px' } }, h('input', { type: 'checkbox', checked: M.showScare, onchange: e => { M.showScare = e.target.checked; M.draw(); } }), 'وريني مدى الفزاعات'),
      h('label', { class: 'row', style: { gap: '6px' } }, h('input', { type: 'checkbox', checked: M.showGrid, onchange: e => { M.showGrid = e.target.checked; M.draw(); } }), 'شبكة المربعات'),
      h('div', { class: 'row', style: { gap: '6px' } }, 'التكبير', h('button', { class: 'btn btn-small', onclick: () => { M.zoom = Math.max(1, M.zoom - 1); M.draw(); } }, '−'), h('button', { class: 'btn btn-small', onclick: () => { M.zoom = Math.min(4, M.zoom + 1); M.draw(); } }, '+')),
      h('div', { class: 'legend muted' }, '🟦 أزرق = بينسقى لحاله من الرشاشات', h('br'), '🟥 مربع أحمر = زرع مش مغطى برشاش'),
      h('div', { id: 'selPanel', class: 'sel-panel' }));
    const wrap = h('div', { class: 'mapwrap', id: 'mapWrap' }, h('canvas', { id: 'mapCanvas' }));
    pg.append(h('h2', null, 'خريطة المزرعة'), h('div', { class: 'maplayout' }, toolCol, wrap));
    setTimeout(() => {
      const cv = document.getElementById('mapCanvas'); cv.addEventListener('mousedown', onDown); cv.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp, { once: false });
      cv.addEventListener('mouseleave', () => { document.getElementById('tip').classList.add('hidden'); M.hover = null; });
      M.draw(); panel();
      const f = App.st.mapFocus || [62, 22]; App.st.mapFocus = null; const w = document.getElementById('mapWrap'); w.scrollLeft = 0; w.scrollTop = 0;
      const tx = px(f[0]) - w.clientWidth / 2, ty = px(f[1]) - w.clientHeight / 2; w.scrollTo({ left: tx, top: ty });
    }, 0);
  };
  function chooseObj() { App.pickItem({ kinds: ['O', 'BC'], noStack: true, title: 'شو بدك تحط بالخريطة؟', filter: it => (it.k === 'BC') || ['Crafting'].includes(it.ty) || it.c === -8 || it.c === -24 }, q => { M.placeQid = q; M.tool = 'place'; App.render(); }); }
  function chooseSeed() { App.pickItem({ kinds: ['O'], noStack: true, title: 'اختار البذرة', filter: it => it.crop && W.crops[it.id.replace('(O)', '')] && it.id !== '(O)770' }, q => { M.seedQid = q; M.tool = 'plant'; App.render(); }); }
})();
