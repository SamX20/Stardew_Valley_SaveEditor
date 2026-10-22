/* Stardew Valley 1.6 save model — works in browser and Node (xmldom) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SDV = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const XSI = 'http://www.w3.org/2001/XMLSchema-instance';
  const XP = [100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000];
  const SEASONS = ['spring', 'summer', 'fall', 'winter'];
  // Data/Fences health by item id (wood and gate checked against fences the game built)
  const FENCE_HEALTH = { 322: 28, 323: 60, 324: 125, 298: 280, 325: 100 };
  const CHEST_COLORS = [[0,0,0],[85,85,255],[119,191,255],[0,170,170],[0,234,175],[0,170,0],[159,236,0],[255,234,18],[255,167,18],[255,105,18],[255,0,0],[135,0,35],[255,173,199],[255,117,195],[172,0,198],[143,0,255],[89,11,142],[64,64,64],[100,100,100],[200,200,200],[254,254,254]];

  let env = { DOMParser: null, XMLSerializer: null, templates: null, world: null, items: null };
  function setEnv(e) { Object.assign(env, e); }

  // ---------- DOM helpers ----------
  const isEl = n => n && n.nodeType === 1;
  function kids(el, tag) { const out = []; if (!el) return out; for (let n = el.firstChild; n; n = n.nextSibling) if (isEl(n) && (!tag || n.nodeName === tag)) out.push(n); return out; }
  function kid(el, tag) { if (!el) return null; for (let n = el.firstChild; n; n = n.nextSibling) if (isEl(n) && n.nodeName === tag) return n; return null; }
  function path(el, ...tags) { let c = el; for (const t of tags) { c = kid(c, t); if (!c) return null; } return c; }
  function txt(el, tag) { const k = tag ? kid(el, tag) : el; return k ? k.textContent : null; }
  function num(el, tag, d = 0) { const v = txt(el, tag); const n = Number(v); return v == null || v === '' || isNaN(n) ? d : n; }
  function setTxt(el, tag, val) { let k = kid(el, tag); if (!k) { k = el.ownerDocument.createElement(tag); el.appendChild(k); } while (k.firstChild) k.removeChild(k.firstChild); k.appendChild(el.ownerDocument.createTextNode(String(val))); return k; }
  function xtype(el) { return el ? (el.getAttributeNS ? el.getAttributeNS(XSI, 'type') : null) || el.getAttribute('xsi:type') || null : null; }
  function isNil(el) { return el && (el.getAttribute('xsi:nil') === 'true' || (el.getAttributeNS && el.getAttributeNS(XSI, 'nil') === 'true')); }
  function walk(el, fn) { fn(el); for (let n = el.firstChild; n; n = n.nextSibling) if (isEl(n)) walk(n, fn); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  // ---------- doc ----------
  class Save {
    constructor(text, infoText) {
      const P = new env.DOMParser();
      this.doc = P.parseFromString(text.replace(/^﻿/, ''), 'text/xml');
      this.root = this.doc.documentElement;
      if (!this.root || this.root.nodeName !== 'SaveGame') throw new Error('هاد مش ملف سيف ستاردو');
      this.info = infoText ? P.parseFromString(infoText.replace(/^﻿/, ''), 'text/xml') : null;
      this.dirty = false;
    }
    serialize() {
      const s = norm(new env.XMLSerializer().serializeToString(this.doc));
      return '﻿' + (s.startsWith('<?xml') ? s : '<?xml version="1.0" encoding="utf-8"?>' + s);
    }
    serializeInfo() {
      // SaveGameInfo == host farmer serialized as <Farmer>
      const p = this.player();
      const ns = ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"';
      const ser = new env.XMLSerializer();
      let inner = '';
      for (let n = p.firstChild; n; n = n.nextSibling) inner += ser.serializeToString(n);
      inner = norm(inner).replace(/ xmlns:xsi="http:\/\/www\.w3\.org\/2001\/XMLSchema-instance"/g, '').replace(/ xmlns:xsd="http:\/\/www\.w3\.org\/2001\/XMLSchema"/g, '');
      return '﻿<?xml version="1.0" encoding="utf-8"?><Farmer' + ns + '>' + inner + '</Farmer>';
    }
    touch() { this.dirty = true; }
    // ---------- basics ----------
    player() { return kid(this.root, 'player'); }
    farmers() {
      const out = [{ el: this.player(), host: true }];
      for (const f of kids(kid(this.root, 'farmhands'), 'Farmer')) out.push({ el: f, host: false });
      return out.map(o => ({ ...o, name: txt(o.el, 'name'), uid: txt(o.el, 'UniqueMultiplayerID'), customized: txt(o.el, 'isCustomized') === 'true' }));
    }
    realFarmers() { return this.farmers().filter(f => f.host || f.customized || (f.name && f.name.trim())); }
    farmerByUid(uid) { return this.farmers().find(f => f.uid === uid); }
    summary() {
      const p = this.player();
      return { farm: txt(p, 'farmName'), name: txt(p, 'name'), money: num(p, 'money'), day: num(this.root, 'dayOfMonth'), season: txt(this.root, 'currentSeason'), year: num(this.root, 'year'), version: txt(this.root, 'gameVersion'), farmType: num(this.root, 'whichFarm'), id: txt(this.root, 'uniqueIDForThisGame') };
    }
    sharedWallet() { return txt(this.player(), 'useSeparateWallets') !== 'true'; }
    locations() { return kids(kid(this.root, 'locations'), 'GameLocation'); }
    location(name) { return this.locations().find(l => txt(l, 'name') === name); }
    allLocations() { // including building interiors
      const out = [];
      for (const l of this.locations()) { out.push({ el: l, name: txt(l, 'name'), parent: null }); for (const b of kids(kid(l, 'buildings'), 'Building')) { const ind = kid(b, 'indoors'); if (ind && !isNil(ind)) out.push({ el: ind, name: txt(ind, 'name') || txt(b, 'buildingType'), parent: txt(l, 'name'), building: b }); } }
      return out;
    }

    // ---------- host swap ----------
    swapHost(uid) {
      const P = this.player(); const hostUid = txt(P, 'UniqueMultiplayerID');
      const F = kids(kid(this.root, 'farmhands'), 'Farmer').find(f => txt(f, 'UniqueMultiplayerID') === uid);
      if (!F || uid === hostUid) throw new Error('اختار لاعب ثاني (مش الهوست)');
      if (txt(F, 'isCustomized') !== 'true') throw new Error('هاد الكوخ فاضي، ما في شخصية فيه');
      // fields that belong to the house/slot, not the character
      const SLOT = ['homeLocation', 'lastSleepLocation', 'lastSleepPoint', 'houseUpgradeLevel', 'daysUntilHouseUpgrade', 'Position', 'disconnectDay', 'disconnectLocation', 'disconnectPosition', 'slotCanHost', 'farmName'];
      const keep = el => { const m = {}; for (const t of SLOT) { const e = kid(el, t); m[t] = e ? e.cloneNode(true) : null; } return m; };
      const kP = keep(P), kF = keep(F);
      const pKids = [], fKids = [];
      while (P.firstChild) pKids.push(P.removeChild(P.firstChild));
      while (F.firstChild) fKids.push(F.removeChild(F.firstChild));
      for (const n of fKids) P.appendChild(n);
      for (const n of pKids) F.appendChild(n);
      const restore = (el, m) => { for (const t of SLOT) { const cur = kid(el, t); const want = m[t]; if (want) { if (cur) el.replaceChild(want, cur); else el.appendChild(want); } else if (cur) el.removeChild(cur); } };
      restore(P, kP); restore(F, kF);
      // the cabin now belongs to the old host
      for (const L of this.allLocations()) { const r = kid(L.el, 'farmhandReference'); if (r && r.textContent === uid) r.textContent = hostUid; }
      // cellars follow the houses
      for (const it of kids(kid(this.root, 'cellarAssignments'), 'item')) { const v = path(it, 'value', 'long'); if (!v) continue; if (v.textContent === hostUid) v.textContent = uid; else if (v.textContent === uid) v.textContent = hostUid; }
      const d = this.date(); setTxt(P, 'dayOfMonthForSaveGame', d.day); setTxt(P, 'seasonForSaveGame', d.season); setTxt(P, 'yearForSaveGame', d.year);
      this.touch();
      return { newHost: txt(P, 'name'), oldHost: txt(F, 'name') };
    }
    // ---------- money / skills ----------
    getMoney(f) { return num(f, 'money'); }
    setMoney(f, v) {
      v = Math.max(0, Math.floor(v));
      if (this.sharedWallet()) for (const x of this.farmers()) setTxt(x.el, 'money', v); else setTxt(f, 'money', v);
      this.touch();
    }
    skills(f) {
      const xp = kids(kid(f, 'experiencePoints'), 'int').map(e => Number(e.textContent));
      const lv = ['farmingLevel', 'fishingLevel', 'foragingLevel', 'miningLevel', 'combatLevel'].map(t => num(f, t));
      return lv.map((l, i) => ({ level: l, xp: xp[i] || 0 }));
    }
    setSkillLevel(f, i, level) {
      level = Math.max(0, Math.min(10, level | 0));
      const tags = ['farmingLevel', 'fishingLevel', 'foragingLevel', 'miningLevel', 'combatLevel'];
      setTxt(f, tags[i], level);
      const xpEls = kids(kid(f, 'experiencePoints'), 'int');
      const cur = Number(xpEls[i].textContent);
      const lo = level === 0 ? 0 : XP[level - 1], hi = level >= 10 ? Infinity : XP[level];
      if (!(cur >= lo && cur < hi)) xpEls[i].textContent = String(lo);
      // drop professions that are no longer reachable
      const tree = env.world.proftree[i];
      const profs = this.professions(f);
      let keep = profs.filter(p => {
        for (const [p5, p10s] of tree) { if (p === p5) return level >= 5; if (p10s.includes(p)) return level >= 10; }
        return true;
      });
      this.setProfessions(f, keep);
      this.clearNewLevels(f, i);
      this.touch();
    }
    clearNewLevels(f, skill) { const nl = kid(f, 'newLevels'); if (!nl) return; for (const p of kids(nl, 'Point')) if (num(p, 'X') === skill) nl.removeChild(p); }
    professions(f) { return kids(kid(f, 'professions'), 'int').map(e => Number(e.textContent)); }
    setProfessions(f, list) {
      const pr = kid(f, 'professions'); clear(pr);
      for (const p of [...new Set(list)]) { const e = this.doc.createElement('int'); e.textContent = String(p); pr.appendChild(e); }
      this.touch();
    }
    setProfession(f, skill, tier, pid) { // tier 5 or 10
      const tree = env.world.proftree[skill];
      let profs = this.professions(f).filter(p => { for (const [p5, p10s] of tree) { if (tier === 5 && (p === p5 || p10s.includes(p))) return false; if (tier === 10 && p10s.includes(p)) return false; } return true; });
      if (pid != null && pid !== '' && pid >= 0) profs.push(Number(pid));
      if (tier === 5 && pid != null) { /* removing 5 also removes 10 handled above */ }
      this.setProfessions(f, profs);
    }
    // ---------- inventory ----------
    inventory(f) { return kids(kid(f, 'items'), 'Item'); }
    maxItems(f) { return num(f, 'maxItems', 12); }
    setMaxItems(f, n) {
      const items = kid(f, 'items'); let list = kids(items, 'Item');
      while (list.length < n) { const e = this.doc.createElement('Item'); e.setAttribute('xsi:nil', 'true'); items.appendChild(e); list.push(e); }
      while (list.length > n) { const last = list[list.length - 1]; if (!isNil(last)) throw new Error('الشنطة فيها أغراض بالخانات الأخيرة، فرّغها أول'); items.removeChild(last); list.pop(); }
      setTxt(f, 'maxItems', n); this.touch();
    }
    // ---------- item creation ----------
    createItem(qid, stack = 1, quality = 0) {
      const t = env.templates[qid]; if (!t) throw new Error('ما لقيت قالب للغرض ' + qid);
      const d = new env.DOMParser().parseFromString('<r xmlns:xsi="' + XSI + '" xmlns:xsd="http://www.w3.org/2001/XMLSchema">' + t + '</r>', 'text/xml');
      const el = this.doc.importNode(kids(d.documentElement)[0], true);
      if (kid(el, 'stack')) setTxt(el, 'stack', stack);
      if (kid(el, 'quality')) setTxt(el, 'quality', quality);
      if (kid(el, 'swingTicker')) setTxt(el, 'swingTicker', Math.floor(Math.random() * 900000));
      return el;
    }
    retag(el, tag, keepType) {
      const n = this.doc.createElement(tag);
      for (let i = 0; i < el.attributes.length; i++) { const a = el.attributes[i]; if (a.name === 'xsi:type' && !keepType) continue; n.setAttribute(a.name, a.value); }
      while (el.firstChild) n.appendChild(el.firstChild);
      return n;
    }
    itemInfo(el) {
      if (!el || isNil(el)) return null;
      const t = xtype(el) || el.nodeName;
      const id = txt(el, 'itemId');
      let q;
      const T = { Object: (txt(el, 'bigCraftable') === 'true' ? '(BC)' : '(O)'), Chest: '(BC)', ColoredObject: '(O)', Ring: '(O)', CombinedRing: '(O)', MeleeWeapon: '(W)', Slingshot: '(W)', Hat: '(H)', Boots: '(B)', Furniture: '(F)', Trinket: '(TR)' };
      if (T[t]) q = T[t] + id;
      else if (t === 'Clothing') q = (txt(el, 'clothesType') === 'PANTS' ? '(P)' : '(S)') + id;
      else q = '(T)' + id;
      return { el, type: t, qid: q, id, name: txt(el, 'name'), stack: num(el, 'stack', 1), quality: num(el, 'quality'), upgrade: num(el, 'upgradeLevel') };
    }
    setSlot(container, index, el) { // container = <items>
      const list = kids(container, 'Item');
      if (index >= list.length) throw new Error('خانة غير موجودة');
      const node = el ? (el.nodeName === 'Item' ? el : this.retag(el, 'Item', true)) : (() => { const e = this.doc.createElement('Item'); e.setAttribute('xsi:nil', 'true'); return e; })();
      if (el && !xtype(node)) node.setAttribute('xsi:type', 'Object');
      container.replaceChild(node, list[index]); this.touch(); return node;
    }
    setStack(el, n) { setTxt(el, 'stack', Math.max(1, n | 0)); this.touch(); }
    setQuality(el, q) { if (kid(el, 'quality')) { setTxt(el, 'quality', q); this.touch(); } }
    addToContainer(container, el, chestMode) { // append or fill nil
      const list = kids(container, 'Item');
      const nil = list.find(isNil);
      if (nil) { container.replaceChild(el, nil); this.touch(); return true; }
      if (chestMode) { container.appendChild(el); this.touch(); return true; }
      return false;
    }
    // ---------- equipment ----------
    equip(f, slot, qid) { // slot: hat | shirtItem | pantsItem | boots
      const old = kid(f, slot);
      let n;
      if (qid) { n = this.retag(this.createItem(qid), slot, false); }
      else { n = this.doc.createElement(slot); n.setAttribute('xsi:nil', 'true'); }
      if (old) f.replaceChild(n, old); else f.appendChild(n);
      this.touch();
    }
    equipped(f, slot) { const e = kid(f, slot); return e && !isNil(e) ? this.itemInfo(e) : null; }
    // ---------- chests ----------
    chests() {
      const out = [];
      for (const L of this.allLocations()) {
        const objs = kid(L.el, 'objects');
        for (const it of kids(objs, 'item')) {
          const o = path(it, 'value', 'Object'); if (!o || xtype(o) !== 'Chest') continue;
          const v = path(it, 'key', 'Vector2');
          const name = txt(o, 'name');
          if (txt(o, 'playerChest') === 'false') continue;
          out.push({ el: o, loc: L.name, parent: L.parent, x: num(v, 'X'), y: num(v, 'Y'), name, items: kid(o, 'items'), kind: txt(o, 'itemId') });
        }
        const fr = kid(L.el, 'fridge');
        if (fr && !isNil(fr) && kid(fr, 'items')) out.push({ el: fr, loc: L.name, parent: L.parent, x: -1, y: -1, name: 'Fridge', items: kid(fr, 'items'), fridge: true });
      }
      return out;
    }
    chestColor(o) { const c = kid(o, 'playerChoiceColor'); return c ? [num(c, 'R'), num(c, 'G'), num(c, 'B'), num(c, 'A')] : [0, 0, 0, 0]; }
    setChestColor(o, rgb) {
      let c = kid(o, 'playerChoiceColor'); if (!c) { c = this.doc.createElement('playerChoiceColor'); o.appendChild(c); }
      const [r, g, b] = rgb; const a = (r | g | b) ? 255 : 0;
      setTxt(c, 'B', b); setTxt(c, 'G', g); setTxt(c, 'R', r); setTxt(c, 'A', a);
      setTxt(c, 'PackedValue', (((a << 24) >>> 0) + (b << 16) + (g << 8) + r) >>> 0);
      this.touch();
    }
    // ---------- relationships ----------
    friendships(f) {
      return kids(kid(f, 'friendshipData'), 'item').map(it => ({ el: it, npc: path(it, 'key', 'string').textContent, points: num(path(it, 'value', 'Friendship'), 'Points'), status: txt(path(it, 'value', 'Friendship'), 'Status') }));
    }
    setFriendship(f, npc, points) {
      points = Math.max(0, Math.min(3750, points | 0));
      const fd = kid(f, 'friendshipData');
      let it = kids(fd, 'item').find(i => path(i, 'key', 'string').textContent === npc);
      if (!it) {
        const tmpl = kids(fd, 'item')[0] || kids(kid(this.player(), 'friendshipData'), 'item')[0];
        if (!tmpl) throw new Error('ما في قالب صداقة');
        it = tmpl.cloneNode(true); path(it, 'key', 'string').textContent = npc;
        const fr = path(it, 'value', 'Friendship');
        for (const [t, v] of [['GiftsThisWeek', 0], ['GiftsToday', 0], ['TalkedToToday', 'false'], ['ProposalRejected', 'false'], ['Status', 'Friendly'], ['RoommateMarriage', 'false']]) if (kid(fr, t)) setTxt(fr, t, v);
        const lg = kid(fr, 'LastGiftDate'); if (lg) { clear(lg); lg.setAttribute('xsi:nil', 'true'); }
        if (this.doc !== it.ownerDocument) it = this.doc.importNode(it, true);
        fd.appendChild(it);
      }
      setTxt(path(it, 'value', 'Friendship'), 'Points', points); this.touch();
    }
    pets() { const out = []; for (const L of this.allLocations()) for (const n of kids(kid(L.el, 'characters'), 'NPC')) if (xtype(n) === 'Pet') out.push({ el: n, name: txt(n, 'name'), loc: L.name, type: txt(n, 'petType') || '', points: num(n, 'friendshipTowardFarmer') }); return out; }
    setPetFriendship(el, v) { setTxt(el, 'friendshipTowardFarmer', Math.max(0, Math.min(1000, v | 0))); this.touch(); }
    // ---------- animals ----------
    animals() {
      // 1.6 writes each animal twice: <animals> and <Animals><SerializableDictionaryOfInt64FarmAnimal>; keep both in sync
      const byId = new Map();
      for (const L of this.allLocations()) {
        const lists = [kids(kid(L.el, 'animals'), 'item'), kids(path(L.el, 'Animals', 'SerializableDictionaryOfInt64FarmAnimal'), 'item')];
        for (const list of lists) for (const it of list) {
          const a = path(it, 'value', 'FarmAnimal'); if (!a) continue; const id = txt(a, 'myID');
          if (!byId.has(id)) byId.set(id, { el: a, els: [], loc: L.name, building: L.building, name: txt(a, 'name'), type: txt(a, 'type'), age: num(a, 'age'), friendship: num(a, 'friendshipTowardFarmer'), happiness: num(a, 'happiness'), id });
          byId.get(id).els.push(a);
        }
      }
      return [...byId.values()];
    }
    setAnimal(el, field, v) {
      const id = txt(el, 'myID'); const a = this.animals().find(x => x.id === id); const els = a ? a.els : [el];
      for (const e of els) { setTxt(e, field, v); if (field === 'name' && kid(e, 'displayName')) setTxt(e, 'displayName', v); }
      this.touch();
    }
    // ---------- date ----------
    date() { return { day: num(this.root, 'dayOfMonth'), season: SEASONS.indexOf(txt(this.root, 'currentSeason')), year: num(this.root, 'year') }; }
    setDate(day, season, year) {
      const before = this.date();
      const abs = d => (d.year - 1) * 112 + d.season * 28 + d.day;
      const delta = abs({ day, season, year }) - abs(before);
      setTxt(this.root, 'dayOfMonth', day); setTxt(this.root, 'currentSeason', SEASONS[season]); setTxt(this.root, 'year', year);
      for (const f of this.farmers()) {
        if (kid(f.el, 'dayOfMonthForSaveGame')) setTxt(f.el, 'dayOfMonthForSaveGame', day);
        if (kid(f.el, 'seasonForSaveGame')) setTxt(f.el, 'seasonForSaveGame', season);
        if (kid(f.el, 'yearForSaveGame')) setTxt(f.el, 'yearForSaveGame', year);
        for (const it of kids(path(f.el, 'stats', 'Values'), 'item')) if (path(it, 'key', 'string') && path(it, 'key', 'string').textContent === 'daysPlayed') { const v = path(it, 'value', 'unsignedInt'); v.textContent = String(Math.max(1, Number(v.textContent) + delta)); }
        const dp = path(f.el, 'stats', 'daysPlayed'); if (dp && dp.textContent !== '' && !isNaN(Number(dp.textContent))) dp.textContent = String(Math.max(1, Number(dp.textContent) + delta));
      }
      this.touch(); return delta;
    }
    // ---------- mines / misc ----------
    setDeepestMine(f, lvl) { setTxt(f, 'deepestMineLevel', lvl); const w = num(this.root, 'mine_lowestLevelReached'); if (lvl > w) setTxt(this.root, 'mine_lowestLevelReached', lvl); this.touch(); }
    // ---------- community center ----------
    bundles() {
      const cc = this.locations().find(l => xtype(l) === 'CommunityCenter'); if (!cc) return null;
      const state = {}; for (const it of kids(kid(cc, 'bundles'), 'item')) state[path(it, 'key', 'int').textContent] = kids(path(it, 'value', 'ArrayOfBoolean'), 'boolean');
      const rewards = {}; for (const it of kids(kid(cc, 'bundleRewards'), 'item')) rewards[path(it, 'key', 'int').textContent] = path(it, 'value', 'boolean');
      const list = [];
      for (const it of kids(kid(this.root, 'bundleData'), 'item')) {
        const key = path(it, 'key', 'string').textContent; const val = path(it, 'value', 'string').textContent;
        const [room, idx] = key.split('/'); const f = val.split('/');
        const ing = f[2].split(' ').filter(Boolean); const ings = [];
        for (let i = 0; i + 2 < ing.length + 1; i += 3) ings.push({ id: ing[i], count: Number(ing[i + 1]), quality: Number(ing[i + 2]) });
        const need = f[4] ? Number(f[4]) : ings.length;
        const arr = state[idx] || [];
        list.push({ room, idx, name: f[0], display: f[6] || f[0], reward: f[1], ings, need, done: ings.map((_, j) => arr[j] ? arr[j].textContent === 'true' : false), boolEls: arr, rewardEl: rewards[idx] });
      }
      const areas = kids(kid(cc, 'areasComplete'), 'boolean').map(b => b.textContent === 'true');
      return { list, areas, cc };
    }
    setIngredient(b, j, val) { if (b.boolEls[j]) { b.boolEls[j].textContent = val ? 'true' : 'false'; this.touch(); } }
    completeBundle(b, rewardPending) { for (const e of b.boolEls) e.textContent = 'true'; if (b.rewardEl) b.rewardEl.textContent = rewardPending ? 'true' : 'false'; this.touch(); }
    resetBundle(b) { for (const e of b.boolEls) e.textContent = 'false'; if (b.rewardEl) b.rewardEl.textContent = 'false'; this.touch(); }

    // ---------- farm map ----------
    farm() { return this.location('Farm'); }
    mapEntities(loc) {
      loc = loc || this.farm(); const out = [];
      for (const it of kids(kid(loc, 'objects'), 'item')) { const v = path(it, 'key', 'Vector2'); const o = path(it, 'value', 'Object'); out.push({ kind: 'obj', el: it, x: num(v, 'X'), y: num(v, 'Y'), w: 1, h: 1, o, name: txt(o, 'name'), type: xtype(o) || 'Object', big: txt(o, 'bigCraftable') === 'true', id: txt(o, 'itemId') }); }
      for (const it of kids(kid(loc, 'terrainFeatures'), 'item')) { const v = path(it, 'key', 'Vector2'); const t = path(it, 'value', 'TerrainFeature'); out.push({ kind: 'tf', el: it, x: num(v, 'X'), y: num(v, 'Y'), w: 1, h: 1, t, type: xtype(t) }); }
      for (const r of kids(kid(loc, 'resourceClumps'), 'ResourceClump')) { const v = kid(r, 'tile'); out.push({ kind: 'clump', el: r, x: num(v, 'X'), y: num(v, 'Y'), w: num(r, 'width', 2), h: num(r, 'height', 2), idx: num(r, 'parentSheetIndex') }); }
      for (const l of kids(kid(loc, 'largeTerrainFeatures'), 'LargeTerrainFeature')) { const v = kid(l, 'tilePosition'); const sz = num(l, 'size', 0); out.push({ kind: 'ltf', el: l, x: num(v, 'X'), y: num(v, 'Y'), w: sz === 2 ? 3 : sz === 1 ? 2 : 1, h: 1, type: xtype(l), size: sz }); }
      for (const b of kids(kid(loc, 'buildings'), 'Building')) out.push({ kind: 'bld', el: b, x: num(b, 'tileX'), y: num(b, 'tileY'), w: num(b, 'tilesWide'), h: num(b, 'tilesHigh'), type: txt(b, 'buildingType'), name: txt(b, 'buildingType') });
      return out;
    }
    occupancy(loc, ignore) {
      const occ = new Map(); const ig = new Set(ignore || []);
      for (const e of this.mapEntities(loc)) { if (ig.has(e.el)) continue; for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (e.x + i) + ',' + (e.y + j); if (!occ.has(k)) occ.set(k, []); occ.get(k).push(e); } }
      return occ;
    }
    setEntityPos(e, x, y) {
      if (e.kind === 'obj' || e.kind === 'tf') {
        const v = path(e.el, 'key', 'Vector2'); setTxt(v, 'X', x); setTxt(v, 'Y', y);
        const inner = e.kind === 'obj' ? path(e.el, 'value', 'Object') : path(e.el, 'value', 'TerrainFeature');
        const tl = kid(inner, 'tileLocation') || kid(inner, 'Tile') || kid(inner, 'tile');
        if (tl) { setTxt(tl, 'X', x); setTxt(tl, 'Y', y); }
        const bb = kid(inner, 'boundingBox'); if (bb) { setTxt(bb, 'X', x * 64); setTxt(bb, 'Y', y * 64); const l = kid(bb, 'Location'); if (l) { setTxt(l, 'X', x * 64); setTxt(l, 'Y', y * 64); } }
      } else if (e.kind === 'clump') { const v = kid(e.el, 'tile'); setTxt(v, 'X', x); setTxt(v, 'Y', y); }
      else if (e.kind === 'ltf') { const v = kid(e.el, 'tilePosition'); setTxt(v, 'X', x); setTxt(v, 'Y', y); }
      else if (e.kind === 'bld') { setTxt(e.el, 'tileX', x); setTxt(e.el, 'tileY', y); }
      e.x = x; e.y = y; this.touch();
    }
    removeEntity(e) { e.el.parentNode.removeChild(e.el); this.touch(); }
    canPlace(loc, x, y, w, h, ignore, needDig) {
      const W = env.world.grid; const occ = this.occupancy(loc, ignore);
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
        const tx = x + i, ty = y + j;
        if (tx < 0 || ty < 0 || tx >= W.w || ty >= W.h) return 'برّا حدود الخريطة';
        const idx = ty * W.w + tx;
        if (W.water[idx] === '1') return 'هاد المربع ماء';
        if (W.blocked[idx] === '1') return 'هاد المربع مسكّر (صخر أو حاجز بالخريطة)';
        if (needDig && W.diggable[idx] !== '1') return 'الأرض هون ما بتنحرث';
        if (occ.has(tx + ',' + ty)) return 'في إشي ثاني بهاد المربع';
      }
      return null;
    }
    placeObject(loc, qid, x, y) {
      let el;
      if (qid.startsWith('CHEST:')) el = this.retag(this.createItem(qid), 'Object', true);
      else { el = this.createItem(qid); const t = xtype(el); el = this.retag(el, 'Object', t && t !== 'Object'); }
      const tl = kid(el, 'tileLocation'); if (tl) { setTxt(tl, 'X', x); setTxt(tl, 'Y', y); }
      const bb = kid(el, 'boundingBox'); if (bb) { setTxt(bb, 'X', x * 64); setTxt(bb, 'Y', y * 64); setTxt(bb, 'Width', 64); setTxt(bb, 'Height', 64); const l = kid(bb, 'Location'); if (l) { setTxt(l, 'X', x * 64); setTxt(l, 'Y', y * 64); } const s = kid(bb, 'Size'); if (s) { setTxt(s, 'X', 64); setTxt(s, 'Y', 64); } }
      if (kid(el, 'hasBeenInInventory')) setTxt(el, 'hasBeenInInventory', 'true');
      if (isFenceObj(el)) this.makeFence(el);
      const item = this.doc.createElement('item'); const k = this.doc.createElement('key'); const v = this.doc.createElement('Vector2');
      setTxt(v, 'X', x); setTxt(v, 'Y', y); k.appendChild(v); item.appendChild(k); const val = this.doc.createElement('value'); val.appendChild(el); item.appendChild(val);
      kid(loc, 'objects').appendChild(item); this.touch(); return item;
    }
    // a placed fence must be <Object xsi:type="Fence"> like new Fence(tile, id, isGate) makes it; a plain Object shows as an icon
    makeFence(el) {
      const id = txt(el, 'itemId'); const gate = id === '325';
      let hp = FENCE_HEALTH[id] + (gate ? 0 : Math.floor(Math.random() * 201 - 100) / 100);
      hp *= 2;
      el.setAttribute('xsi:type', 'Fence');
      setTxt(el, 'price', 1);
      setTxt(el, 'health', gate ? hp * 2 : hp); setTxt(el, 'maxHealth', hp);
      if (!kid(el, 'whichType')) { const w = this.doc.createElement('whichType'); w.setAttribute('xsi:nil', 'true'); el.appendChild(w); }
      setTxt(el, 'gatePosition', 0); setTxt(el, 'gateMotion', 0); setTxt(el, 'isGate', gate);
      this.touch();
    }
    brokenFences(loc) { return kids(kid(loc || this.farm(), 'objects'), 'item').map(it => path(it, 'value', 'Object')).filter(o => o && !xtype(o) && isFenceObj(o)); }
    fixFences(loc) { const list = this.brokenFences(loc); for (const o of list) this.makeFence(o); return list.length; }
    // the game also needs the tile under each door clear (Data/Buildings AdditionalPlacementTiles + humanDoor check in buildStructure)
    doorCheck(loc, b, x, y, ignore) {
      const W = env.world.grid; const occ = this.occupancy(loc, ignore);
      for (const [tag, what] of [['animalDoor', 'باب الحيوانات'], ['humanDoor', 'الباب']]) {
        const d = kid(b, tag); if (!d || num(d, 'X', -1) < 0) continue;
        const tx = x + num(d, 'X'), ty = y + num(d, 'Y') + 1;
        if (tx < 0 || ty < 0 || tx >= W.w || ty >= W.h) return `قدام ${what} برّا الخريطة`;
        const idx = ty * W.w + tx;
        if (W.water[idx] === '1' || W.blocked[idx] === '1') return `قدام ${what} مسكّر`;
        const hit = (occ.get(tx + ',' + ty) || []).find(e => !(e.kind === 'tf' && !['Tree', 'FruitTree'].includes(e.type)));
        if (hit) return `في إشي قدام ${what} (لازم المربع اللي تحته يكون فاضي)`;
      }
      return null;
    }
    makeHoeDirt(x, y, seedId, state) {
      const d = this.doc; const item = d.createElement('item'); const k = d.createElement('key'); const v = d.createElement('Vector2');
      setTxt(v, 'X', x); setTxt(v, 'Y', y); k.appendChild(v); item.appendChild(k);
      const val = d.createElement('value'); const tf = d.createElement('TerrainFeature'); tf.setAttribute('xsi:type', 'HoeDirt');
      setTxt(tf, 'state', state || 0); const tile = d.createElement('Tile'); setTxt(tile, 'X', x); setTxt(tile, 'Y', y); tf.appendChild(tile);
      if (seedId) {
        const c = env.world.crops[seedId]; if (!c) throw new Error('هاد مش بذرة زرع');
        const crop = d.createElement('crop'); const pd = d.createElement('phaseDays');
        for (const n of [...c.phases, 99999]) { const e = d.createElement('int'); e.textContent = String(n); pd.appendChild(e); }
        crop.appendChild(pd);
        setTxt(crop, 'rowInSpriteSheet', c.sprite); setTxt(crop, 'phaseToShow', -1); setTxt(crop, 'currentPhase', 0);
        setTxt(crop, 'indexOfHarvest', c.harvest); setTxt(crop, 'dayOfCurrentPhase', 0);
        const tint = d.createElement('tintColor'); let col = [0, 0, 0, 0], prog = false;
        if (c.tint && c.tint.length) { const hex = c.tint[Math.floor(Math.random() * c.tint.length)]; const rgb = parseColor(hex); if (rgb) { col = [...rgb, 255]; prog = true; } }
        setTxt(tint, 'B', col[2]); setTxt(tint, 'G', col[1]); setTxt(tint, 'R', col[0]); setTxt(tint, 'A', col[3]); setTxt(tint, 'PackedValue', (((col[3] << 24) >>> 0) + (col[2] << 16) + (col[1] << 8) + col[0]) >>> 0); crop.appendChild(tint);
        setTxt(crop, 'flip', Math.random() < 0.5); setTxt(crop, 'fullGrown', 'false'); setTxt(crop, 'raisedSeeds', c.raised ? 'true' : 'false'); setTxt(crop, 'programColored', prog);
        setTxt(crop, 'dead', 'false'); setTxt(crop, 'forageCrop', 'false'); setTxt(crop, 'seedIndex', seedId);
        tf.appendChild(crop);
      }
      val.appendChild(tf); item.appendChild(val); return item;
    }
    plant(loc, seedId, x, y) {
      const tfs = kid(loc, 'terrainFeatures');
      const ex = kids(tfs, 'item').find(it => { const v = path(it, 'key', 'Vector2'); return num(v, 'X') === x && num(v, 'Y') === y; });
      if (ex) { const t = path(ex, 'value', 'TerrainFeature'); if (xtype(t) !== 'HoeDirt') throw new Error('في إشي ثاني بالمربع'); if (kid(t, 'crop')) throw new Error('مزروع أصلاً'); const fresh = this.makeHoeDirt(x, y, seedId, num(t, 'state')); const c = path(fresh, 'value', 'TerrainFeature', 'crop'); t.appendChild(c); this.touch(); return ex; }
      const it = this.makeHoeDirt(x, y, seedId, 0); tfs.appendChild(it); this.touch(); return it;
    }
    till(loc, x, y) { const it = this.makeHoeDirt(x, y, null, 0); kid(loc, 'terrainFeatures').appendChild(it); this.touch(); return it; }
    setWatered(tfEl, on) { const t = path(tfEl, 'value', 'TerrainFeature'); if (xtype(t) === 'HoeDirt') { setTxt(t, 'state', on ? 1 : 0); this.touch(); } }
    cropInfo(tfEl) {
      const t = path(tfEl, 'value', 'TerrainFeature'); const c = kid(t, 'crop'); if (!c) return null;
      const pd = kids(kid(c, 'phaseDays'), 'int').map(e => Number(e.textContent));
      return { el: c, harvest: txt(c, 'indexOfHarvest'), seed: txt(c, 'seedIndex'), phase: num(c, 'currentPhase'), phases: pd, day: num(c, 'dayOfCurrentPhase'), full: txt(c, 'fullGrown') === 'true', dead: txt(c, 'dead') === 'true', row: num(c, 'rowInSpriteSheet'), watered: num(t, 'state') === 1, fert: txt(t, 'fertilizer') };
    }
    makeCropReady(tfEl) { const ci = this.cropInfo(tfEl); if (!ci) return; setTxt(ci.el, 'currentPhase', ci.phases.length - 1); setTxt(ci.el, 'dayOfCurrentPhase', 0); this.touch(); }
  }
  function isFenceObj(o) { return txt(o, 'bigCraftable') !== 'true' && FENCE_HEALTH[txt(o, 'itemId')] != null; }
  function norm(x) { return x.replace(/<([A-Za-z_][\w.\-]*)((?:\s[^<>]*?)?)\/>/g, (m, t, a) => '<' + t + (a ? a.replace(/\s+$/, '') : '') + ' />'); }
  function parseColor(s) {
    if (!s) return null; s = s.trim();
    const named = { red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0], orange: [255, 165, 0], purple: [128, 0, 128], pink: [255, 192, 203], white: [255, 255, 255] };
    if (named[s.toLowerCase()]) return named[s.toLowerCase()];
    if (s[0] === '#') { const h = s.slice(1); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
    const p = s.split(/[ ,]+/).map(Number); if (p.length >= 3 && p.every(n => !isNaN(n))) return p.slice(0, 3);
    return null;
  }
  function levelFromXp(xp) { let l = 0; for (const t of XP) if (xp >= t) l++; return l; }
  return { Save, setEnv, XP, SEASONS, CHEST_COLORS, levelFromXp, helpers: { kids, kid, path, txt, num, setTxt, xtype, isNil } };
});
