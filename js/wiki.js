/* الموسوعة */
'use strict';
(function () {
  const h = (...a) => App.h(...a);
  const BY = Object.fromEntries(SDV_ITEMS.map(i => [i.id, i]));
  const SEA = ['الربيع', 'الصيف', 'الخريف', 'الشتاء'];
  const KIND = { O: 'غرض', BC: 'آلة / غرض كبير', W: 'سلاح', T: 'أداة', H: 'قبعة', S: 'قميص', P: 'بنطلون', B: 'حذاء' };
  const WEATHER = { sunny: 'مشمس', rainy: 'ماطر', both: 'أي طقس' };
  const BEH = { mixed: 'متقلّبة', dart: 'سريعة ونطّاطة', smooth: 'هادية', sinker: 'بتغطس لتحت', floater: 'بتطلع لفوق' };
  const WTYPE = { 0: 'سيف طعن (خنجر سريع)', 1: 'خنجر', 2: 'هراوة/مطرقة', 3: 'سيف' };
  const fmtTime = t => { const hr = Math.floor(t / 100) % 24, m = t % 100; const ap = hr < 12 ? 'ص' : 'م'; const h12 = hr % 12 || 12; return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''}${ap}`; };
  const npc = n => (W.npcs[n] && W.npcs[n].ar) || n;
  function norm(s) { return (s || '').toLowerCase().replace(/[ًٌٍَُِّْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي'); }
  function search(q) {
    q = norm(q.trim()); if (!q) return [];
    const res = [];
    for (const it of SDV_ITEMS) {
      if (it.hid) continue;
      const en = norm(it.en), ar = norm(it.ar);
      let sc = 0;
      if (en === q || ar === q) sc = 100; else if (en.startsWith(q) || ar.startsWith(q)) sc = 60; else if (en.includes(q) || ar.includes(q)) sc = 30; else if (norm(it.n).includes(q)) sc = 20;
      if (sc) res.push([sc - (it.k === 'O' ? 0 : 5), it]);
    }
    return res.sort((a, b) => b[0] - a[0] || a[1].en.localeCompare(b[1].en)).slice(0, 120).map(x => x[1]);
  }
  function chipItem(q, extra) { const it = BY[q]; if (!it) return h('span', { class: 'chip' }, q.startsWith('CAT') ? (W.cat[q.slice(3)] ? 'أي ' + W.cat[q.slice(3)] : q) : q, extra || ''); return h('span', { class: 'chip', onclick: () => show(q) }, App.icon(q, 18), h('span', { class: 'en' }, it.en), extra || ''); }
  function fact(label, ...val) { return h('div', { class: 'fact' }, h('b', null, label), ...val); }
  function summary(it) {
    const parts = [];
    const cat = W.cat[it.c] || W.typeAr[it.ty] || KIND[it.k];
    let s = `${it.ar || it.en} هو ${cat || 'غرض'} باللعبة.`;
    if (it.grow) s += ` بتزرعه من بذوره بـ${it.grow.seasons.map(x => SEA[x]).join(' و')}، وبياخذ ${it.grow.days} يوم لينضج` + (it.grow.regrow > 0 ? `، وبعدها بيرجع يطلع كل ${it.grow.regrow} يوم.` : '.');
    if (it.crop) s += ` هاي بذور بتنزرع بـ${it.crop.seasons.map(x => SEA[x]).join(' و')} وبتطلع ${BY[it.crop.harvest] ? (BY[it.crop.harvest].ar || BY[it.crop.harvest].en) : ''} بعد ${it.crop.days} يوم` + (it.crop.regrow > 0 ? ` وبترجع تثمر كل ${it.crop.regrow} يوم.` : '.');
    if (it.fish && !it.fish.trap) s += ` سمكة بتنصاد بـ${it.fish.seasons.map(x => SEA[x]).join(' و') || 'كل المواسم'}` + (it.locs && it.locs.length ? ` بـ${it.locs.slice(0, 3).join('، ')}` : '') + ` من ${fmtTime(it.fish.times[0])} لـ${fmtTime(it.fish.times[1])}` + (it.fish.weather && it.fish.weather !== 'both' ? ` لما يكون الطقس ${WEATHER[it.fish.weather]}` : '') + '.';
    if (it.fish && it.fish.trap) s += ` بتنمسك بمصيدة السرطانات (Crab Pot) ${it.fish.where === 'ocean' ? 'بالبحر' : 'بالمي الحلوة (نهر أو بحيرة)'}.`;
    if (it.tree) s += ` شتلة شجرة بتثمر بـ${it.tree.seasons.map(x => SEA[x]).join(' و')} بعد 28 يوم من زراعتها، وبدها 8 مربعات فاضية حواليها.`;
    if (it.c === -2 || it.ty === 'Minerals') s += ' بتلاقيه بالمناجم أو بتكسير الجيود، وممكن تتبرع فيه للمتحف.';
    if (it.ty === 'Arch') s += ' أثر قديم بتلاقيه بالحفر (الديدان اللي بتتحرك بالأرض) أو بالجيود، وبتتبرع فيه للمتحف.';
    if (it.e > 0 && it.k === 'O') s += ` بينوكل وبيعطي ${Math.ceil(it.e * 2.5)} طاقة.`;
    if (it.k === 'W' && it.dmg) s += ` ضرره من ${it.dmg[0]} لـ${it.dmg[1]}.`;
    return s;
  }
  function show(q) { App.st.wikiSel = q; renderDetail(); }
  function renderDetail() {
    const box = document.getElementById('wikiDetail'); if (!box) return; box.innerHTML = '';
    const it = BY[App.st.wikiSel]; if (!it) { box.append(h('div', { class: 'empty' }, 'اكتب اسم أي غرض بالإنجليزي أو بالعربي 🔎')); return; }
    const card = h('div', { class: 'wood wcard' });
    card.append(h('div', { class: 'title' }, App.icon(it.id, 72), h('div', null, h('h2', { class: 'en' }, it.en), h('div', { style: { fontSize: '20px', fontWeight: 800 } }, it.ar || ''), h('div', { class: 'muted' }, W.cat[it.c] || W.typeAr[it.ty] || KIND[it.k], ' • ', h('span', { class: 'en' }, it.id)))));
    card.append(h('p', { style: { fontSize: '16px', lineHeight: 1.8 } }, summary(it)));
    const facts = h('div', { class: 'facts' });
    if (it.p) facts.append(fact('سعر البيع', h('span', null, '💰 ', it.p.toLocaleString(), 'g'), h('div', { class: 'muted' }, `فضي ${Math.floor(it.p * 1.25)} • ذهبي ${Math.floor(it.p * 1.5)} • إيريديوم ${Math.floor(it.p * 2)}`)));
    if (it.e > 0 && it.k === 'O') facts.append(fact('لما توكله', `⚡ ${Math.ceil(it.e * 2.5)} طاقة • ❤️ ${Math.floor(it.e * 2.5 * 0.45)} صحة`));
    if (it.grow) facts.append(fact('الزراعة', `${it.grow.seasons.map(x => SEA[x]).join('، ')} • ${it.grow.days} يوم`, it.grow.regrow > 0 ? h('div', null, `بيرجع يثمر كل ${it.grow.regrow} يوم`) : null, it.grow.raised ? h('div', null, 'بدها عمود (تريليس) وما بتنمشى عليها') : null, it.grow.seed ? h('div', null, 'البذرة: ', chipItem(it.grow.seed)) : null));
    if (it.crop) facts.append(fact('بتطلع', chipItem(it.crop.harvest), h('div', null, `${it.crop.seasons.map(x => SEA[x]).join('، ')} • ${it.crop.days} يوم`)));
    if (it.fish && !it.fish.trap) { facts.append(fact('وين وإيمتى', (it.locs || []).join('، ') || '—', h('div', null, `${it.fish.seasons.map(x => SEA[x]).join('، ')}`), h('div', null, `${fmtTime(it.fish.times[0])} – ${fmtTime(it.fish.times[1])} • ${WEATHER[it.fish.weather] || it.fish.weather}`))); facts.append(fact('صعوبة الصيد', `${it.fish.diff}/100 • حركتها ${BEH[it.fish.beh] || it.fish.beh}`)); }
    if (it.fish && it.fish.trap) facts.append(fact('طريقة الصيد', 'مصيدة سرطانات ' + (it.fish.where === 'ocean' ? 'بالبحر' : 'بالمي الحلوة')));
    if (it.tree) facts.append(fact('الشجرة بتعطي', ...(it.tree.fruits || []).map(f => chipItem(f.startsWith('(') ? f : '(O)' + f))));
    if (it.fromTree) facts.append(fact('بيجي من شجرة', chipItem(it.fromTree)));
    if (it.k === 'W' && it.dmg) facts.append(fact('السلاح', `${WTYPE[it.wt] || ''} • ضرر ${it.dmg[0]}-${it.dmg[1]}`));
    if (it.df) facts.append(fact('الحذاء', `دفاع +${it.df[0]} • مناعة +${it.df[1]}`));
    if (it.shops && it.shops.length) facts.append(fact('بتشتريه من', ...it.shops.map(([s, p]) => h('div', null, s, p > 0 ? ` — ${p.toLocaleString()}g` : ''))));
    card.append(facts);
    if (it.recipe) card.append(h('h3', null, it.recipe.kind === 'cook' ? '🍳 طريقة الطبخ' : '🔨 طريقة الصنع'), h('div', { class: 'chips' }, it.recipe.ing.map(([q, n]) => chipItem(q, ' ×' + n))), it.recipe.unlock ? h('div', { class: 'muted' }, 'بتتعلمها: ', unlockAr(it.recipe.unlock)) : null);
    if (it.usedIn && it.usedIn.length) card.append(h('h3', null, '🧩 بيدخل بصنع'), h('div', { class: 'chips' }, [...new Map(it.usedIn.map(u => [u[0], u])).values()].slice(0, 40).map(([q, k]) => chipItem(q, k === 'cook' ? ' 🍳' : ' 🔨'))));
    if (it.gift) {
      card.append(h('h3', null, '🎁 كهدية'));
      if (it.gift.love) card.append(h('div', null, h('b', null, '😍 بيحبوه كتير: '), it.gift.love.map(npc).join('، ')));
      if (it.gift.like) card.append(h('div', { style: { marginTop: '4px' } }, h('b', null, '🙂 بيعجبهم: '), it.gift.like.map(npc).join('، ')));
    }
    const s = App.st.save;
    if (s) { const B = s.bundles(); if (B) { const need = B.list.filter(b => b.ings.some((g, j) => (g.id.startsWith('(') ? g.id : '(O)' + g.id) === it.id && !b.done[j])); if (need.length) card.append(h('div', { class: 'notice' }, '🏛️ المركز المجتمعي لسا محتاجه بـ: ', need.map(b => W.bundleAr[b.name] || b.display).join('، '))); } }
    if (it.d) card.append(h('h3', null, 'وصف اللعبة (إنجليزي)'), h('p', { class: 'en', style: { direction: 'ltr', textAlign: 'left', fontFamily: 'inherit' } }, it.d));
    box.append(card);
  }
  function unlockAr(u) {
    const m = /^s (\w+) (\d+)/.exec(u); if (m) return `مستوى ${m[2]} بمهارة ${({ Farming: 'الزراعة', Fishing: 'الصيد', Foraging: 'جمع المنتجات البرية', Mining: 'التعدين', Combat: 'القتال', Luck: 'الحظ' })[m[1]] || m[1]}`;
    const f = /^f (\w+) (\d+)/.exec(u); if (f) return `${f[2] / 250} قلوب مع ${npc(f[1])}`;
    if (u === 'default') return 'من البداية'; if (u === 'null' || u === 'none') return 'من الجوائز أو التلفزيون أو أماكن خاصة';
    return u;
  }
  App.pages.wiki = (pg) => {
    const input = h('input', { type: 'search', placeholder: 'اكتب اسم الغرض… مثلاً Sunfish أو سمكة الشمس', style: { width: '100%', fontSize: '18px' }, value: App.st.wikiQ || '' });
    const results = h('div', { class: 'results' });
    function draw() {
      App.st.wikiQ = input.value; results.innerHTML = '';
      const list = search(input.value);
      if (!input.value.trim()) { results.append(h('div', { class: 'muted' }, 'جرب: Sunfish، Parsnip، Quality Sprinkler، Prismatic Shard، بطاطا')); return; }
      if (!list.length) results.append(h('div', { class: 'muted' }, 'ما لقيت شي. جرّب كلمة أقصر.'));
      for (const it of list) results.append(h('button', { class: 'pick', onclick: () => show(it.id) }, App.icon(it.id, 32), h('span', null, h('b', { class: 'en' }, it.en), h('small', null, (it.ar ? it.ar + ' • ' : '') + (W.cat[it.c] || KIND[it.k])))));
      if (list.length && !App.st.wikiSel) show(list[0].id);
    }
    input.oninput = () => { draw(); };
    input.onkeydown = e => { if (e.key === 'Enter') { const l = search(input.value); if (l[0]) show(l[0].id); } };
    pg.append(h('h2', null, '📖 الموسوعة'), h('div', { class: 'wiki' }, h('div', null, input, h('div', { style: { height: '8px' } }), results), h('div', { id: 'wikiDetail' })));
    draw(); setTimeout(() => { renderDetail(); input.focus(); }, 0);
  };
})();
