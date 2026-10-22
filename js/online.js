/* النسخة الأونلاين: أول مرة بيشرح ملف الربط، بعدها بيفتح السيفات مباشرة كل مرة، مع حذف ونسخ وتغيير اسم */
'use strict';
(function () {
  const h = (...a) => App.h(...a);
  const H = SDV.helpers;
  const st = App.st;
  const TRASH = '_editor_trash';
  const FS_OK = !!window.showDirectoryPicker;
  const IS_WIN = /Win/i.test(navigator.platform || navigator.userAgent);
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
  const O = App.online = { ready: false, needClick: false, trash: [] };

  // ---------- the link .bat (generated so it can open this exact page when done) ----------
  function batText() {
    const url = (location.origin + location.pathname).replace(/%/g, '%%');
    return [
      '@echo off',
      'setlocal',
      'title Stardew Save Editor - one-time folder link',
      'echo ===========================================================',
      'echo   Stardew Save Editor - one-time setup',
      'echo   Chrome is not allowed to open the AppData folder, so this',
      'echo   moves your Stardew saves to a normal folder and leaves a',
      'echo   link in the old place. The game keeps working as before.',
      'echo   Nothing is installed. Nothing else on your PC is touched.',
      'echo ===========================================================',
      'echo.',
      'set "SRC=%APPDATA%\\StardewValley\\Saves"',
      'set "DST=%USERPROFILE%\\StardewSaves"',
      'tasklist /FI "IMAGENAME eq Stardew Valley.exe" 2>nul | find /I "Stardew Valley.exe" >nul && goto gameopen',
      'tasklist /FI "IMAGENAME eq StardewModdingAPI.exe" 2>nul | find /I "StardewModdingAPI.exe" >nul && goto gameopen',
      'fsutil reparsepoint query "%SRC%" >nul 2>&1 && goto linked',
      'if not exist "%SRC%" goto nosaves',
      'if exist "%DST%" goto dstexists',
      'echo [1/3] Copying your saves to %DST% ...',
      'robocopy "%SRC%" "%DST%" /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS >nul',
      'if errorlevel 8 goto copyfail',
      'echo [2/3] Keeping an untouched backup of the old folder ...',
      'set "BK=Saves_backup_%RANDOM%"',
      'ren "%SRC%" "%BK%" || goto renfail',
      'echo [3/3] Creating the link ...',
      'mklink /J "%SRC%" "%DST%" >nul || goto linkfail',
      'echo.',
      'echo DONE!',
      'echo   Your saves now live in:  %DST%',
      'echo   Untouched backup:        %APPDATA%\\StardewValley\\%BK%',
      'echo.',
      'echo   The folder path is copied. In the editor press "Choose the folder",',
      'echo   press Ctrl+V in the address bar of the window, Enter, then "Select Folder".',
      'echo %DST%| clip',
      'start "" "' + url + '?linked=1"',
      'goto end',
      ':linked',
      'echo Already set up. The editor folder is:  %DST%',
      'echo %DST%| clip',
      'echo.',
      'choice /C OU /N /M "Press O to open the editor, or U to UNDO and put the saves back: "',
      'if errorlevel 2 goto undo',
      'start "" "' + url + '?linked=1"',
      'goto end',
      ':undo',
      'dir "%APPDATA%\\StardewValley" | find "<JUNCTION>" | find /I "StardewSaves" >nul || goto notours',
      'rmdir "%SRC%"',
      'robocopy "%DST%" "%SRC%" /E /MOVE /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS >nul',
      'if errorlevel 8 goto undofail',
      'echo Undone. Your saves are back in %SRC%',
      'goto end',
      ':undofail',
      'echo Moving back failed. Restoring the link so nothing is lost ...',
      'if not exist "%SRC%" mklink /J "%SRC%" "%DST%" >nul',
      'goto end',
      ':notours',
      'echo The link was not made by this tool, so it was left alone.',
      'goto end',
      ':gameopen',
      'echo Please close Stardew Valley first, then run this file again.',
      'goto end',
      ':nosaves',
      'echo Could not find the saves folder: %SRC%',
      'echo Start the game once and make a save, then run this again.',
      'goto end',
      ':dstexists',
      'echo The folder %DST% already exists. Rename or delete it, then run this again.',
      'goto end',
      ':copyfail',
      'echo Copy failed. Nothing was changed.',
      'goto end',
      ':renfail',
      'echo Could not rename the old folder. Close Steam and any open folder windows, then try again.',
      'echo Nothing was changed.',
      'rmdir /S /Q "%DST%"',
      'goto end',
      ':linkfail',
      'echo Link failed. Putting everything back ...',
      'ren "%APPDATA%\\StardewValley\\%BK%" "Saves"',
      'rmdir /S /Q "%DST%"',
      'goto end',
      ':end',
      'echo.',
      'pause',
      ''
    ].join('\r\n');
  }
  function downloadBat() { App.download(new Blob([batText()], { type: 'application/octet-stream' }), 'StardewSaves_Link.bat'); LS.set('sdvBatDownloaded', '1'); }

  // ---------- folder helpers ----------
  async function exists(dir, name, kind) { try { if (kind === 'dir') await dir.getDirectoryHandle(name); else await dir.getFileHandle(name); return true; } catch (e) { return false; } }
  async function readText(dir, name) { return await (await (await dir.getFileHandle(name)).getFile()).text(); }
  async function writeText(dir, name, text) { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(new TextEncoder().encode(text)); await w.close(); }
  async function copyDir(src, dst, rename) {
    for await (const [n, hd] of src.entries()) {
      const nn = rename ? rename(n, hd.kind) : n; if (!nn) continue;
      if (hd.kind === 'directory') await copyDir(hd, await dst.getDirectoryHandle(nn, { create: true }), rename);
      else { const f = await hd.getFile(); const w = await (await dst.getFileHandle(nn, { create: true })).createWritable(); await w.write(f); await w.close(); }
    }
  }
  const cleanName = s => [...(s || '')].filter(c => /[\p{L}\p{N}]/u.test(c)).join('');
  async function saveId(dir, name) { const m = (await readText(dir, name)).slice(0, 400000).match(/<uniqueIDForThisGame>(\d+)</); return m ? m[1] : name.split('_').pop(); }

  async function readSave(hd, name) {
    const s = { dir: hd, name };
    try { const d = new DOMParser().parseFromString((await readText(hd, 'SaveGameInfo')).replace(/^\uFEFF/, ''), 'text/xml').documentElement; s.farm = H.txt(d, 'farmName'); s.player = H.txt(d, 'name'); s.money = H.num(d, 'money'); s.day = H.num(d, 'dayOfMonthForSaveGame'); s.season = H.num(d, 'seasonForSaveGame'); s.year = H.num(d, 'yearForSaveGame'); } catch (e) { }
    try { s.mtime = (await (await hd.getFileHandle(name)).getFile()).lastModified; } catch (e) { s.mtime = 0; }
    return s;
  }
  async function scan(root) {
    // picked a single save folder instead of the Saves folder: still works, just without manage buttons
    if (await exists(root, 'SaveGameInfo') && await exists(root, root.name)) return { saves: [await readSave(root, root.name)], trash: [], single: true };
    const saves = [];
    for await (const [name, hd] of root.entries()) {
      if (hd.kind !== 'directory' || name.startsWith('_')) continue;
      if (!(await exists(hd, 'SaveGameInfo')) || !(await exists(hd, name))) continue;
      saves.push(await readSave(hd, name));
    }
    saves.sort((a, b) => b.mtime - a.mtime);
    const trash = [];
    try { const t = await root.getDirectoryHandle(TRASH); for await (const [n, hd] of t.entries()) if (hd.kind === 'directory') trash.push({ n, dir: hd }); } catch (e) { }
    trash.sort((a, b) => b.n.localeCompare(a.n));
    return { saves, trash, single: false };
  }
  async function refresh(quiet) {
    if (!st.root) return;
    try {
      const r = await scan(st.root); const before = st.saves.map(s => s.name).join('|');
      st.saves = r.saves; O.trash = r.trash; O.single = r.single;
      if (st.tab === 'home') App.render();
      if (quiet && before && before !== st.saves.map(s => s.name).join('|')) App.toast('🔄 انحدّثت قائمة السيفات');
    } catch (e) { if (!quiet) App.toast(e.message, true); }
  }

  App.openFolder = async function (handle) {
    if (!FS_OK) { App.openUpload(); return; }
    try {
      const dir = handle || await window.showDirectoryPicker({ id: 'sdvsaves', mode: 'readwrite' });
      if ((await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') { App.toast('لازم تسمح بالتعديل عشان أقدر أحفظ على السيفات', true); return; }
      // picked one save instead of the Saves folder?
      const r = await scan(dir);
      if (!r.saves.length && !r.trash.length) {
        App.toast(handle ? 'المجلد صار فاضي أو انشال. اختاره من جديد.' : 'ما لقيت سيفات بهاد المجلد. اختار مجلد StardewSaves اللي بمجلد المستخدم.', true);
        if (!handle) return;
      }
      st.root = dir; App.idb('put', dir); LS.set('sdvOnboarded', '1');
      st.saves = r.saves; O.trash = r.trash; O.single = r.single; O.ready = true; O.needClick = false;
      if (location.search) history.replaceState(null, '', location.pathname);
      st.tab = 'home'; App.render();
    } catch (e) { if (e.name !== 'AbortError') App.toast(e.message, true); }
  };

  // ---------- save management ----------
  function closeIfOpen(name) { if (st.save && st.saveName === name) { st.save = null; st.saveDir = null; st.saveName = null; document.getElementById('btnUndo').disabled = true; App.markDirty(); } }
  async function moveToTrash(s) {
    const t = await st.root.getDirectoryHandle(TRASH, { create: true });
    const dst = await t.getDirectoryHandle(s.name + '__' + App.stamp(), { create: true });
    await copyDir(s.dir, dst);
    await st.root.removeEntry(s.name, { recursive: true });
  }
  function askDelete(s) {
    const go = async () => {
      if (st.save && st.saveName === s.name && st.save.dirty && !confirm('هاد السيف مفتوح وفيه تعديلات مش محفوظة. أكمل بالحذف؟')) return;
      App.closeModal();
      try { closeIfOpen(s.name); await moveToTrash(s); App.toast('🗑️ انحذف ' + (s.farm || s.name) + ' (موجود بسلة المحذوفات)'); await refresh(); }
      catch (e) { App.toast('ما قدرت أحذفه: ' + e.message + ' — تأكد إن اللعبة مسكّرة', true); }
    };
    App.modal(h('div', null, h('h2', null, '🗑️ حذف السيف؟'),
      h('p', null, 'بدك تحذف مزرعة ', h('b', null, s.farm || s.name), ' (', h('span', { class: 'en' }, s.name), ')', '؟'),
      h('div', { class: 'notice' }, 'ما بيروح نهائياً: بينحط بـ "سلة المحذوفات" تحت بالصفحة الرئيسية، وبتقدر ترجّعه وقت ما بدك.'),
      h('div', { class: 'row' }, h('button', { class: 'btn btn-red', onclick: go }, 'إيه، احذفه'), h('button', { class: 'btn', onclick: () => App.closeModal() }, 'لا، رجوع'))));
  }
  function askName(s, mode) { // mode: 'copy' | 'rename'
    const inp = h('input', { type: 'text', value: s.farm || '', maxlength: 32, style: { width: '100%', fontSize: '18px' } });
    const farmChk = h('input', { type: 'checkbox', checked: true, id: 'chkFarm' });
    const prev = h('div', { class: 'muted en', style: { marginTop: '6px' } });
    const err = h('div', { class: 'notice bad', style: { display: 'none' } });
    let id = null; saveId(s.dir, s.name).then(v => { id = v; upd(); });
    const upd = () => { const c = cleanName(inp.value); prev.textContent = c && id ? 'اسم المجلد: ' + c + '_' + id : ''; };
    inp.oninput = upd;
    const go = async () => {
      const c = cleanName(inp.value); err.style.display = 'none';
      if (!c) { err.textContent = 'اكتب اسم فيه حروف أو أرقام.'; err.style.display = ''; return; }
      if (!id) return;
      const folder = c + '_' + id;
      if (folder === s.name && !(mode === 'rename' && farmChk.checked)) { err.textContent = 'هاد نفس الاسم الحالي.'; err.style.display = ''; return; }
      if (folder !== s.name && await exists(st.root, folder, 'dir')) { err.textContent = 'في سيف بهاد الاسم من قبل. اختار اسم ثاني.'; err.style.display = ''; return; }
      if (st.save && st.saveName === s.name && st.save.dirty && !confirm('هاد السيف مفتوح وفيه تعديلات مش محفوظة، وما رح تنتقل. أكمل؟')) return;
      App.closeModal(); App.toast('⏳ لحظة…');
      try {
        if (folder !== s.name) {
          const dst = await st.root.getDirectoryHandle(folder, { create: true });
          await copyDir(s.dir, dst, (n, kind) => {
            if (mode === 'copy' && kind === 'directory' && n === 'editor_backups') return null;
            if (/_STARDEWVALLEYSAVETMP$|\.editor_tmp$/.test(n)) return null;
            return n === s.name ? folder : n === s.name + '_old' ? folder + '_old' : n;
          });
        }
        const dir = await st.root.getDirectoryHandle(folder);
        if (farmChk.checked) {
          let info = null; try { info = await readText(dir, 'SaveGameInfo'); } catch (e) { }
          const sv = new SDV.Save(await readText(dir, folder), info);
          for (const f of sv.farmers()) H.setTxt(f.el, 'farmName', inp.value.trim() || c);
          await writeText(dir, folder, sv.serialize()); await writeText(dir, 'SaveGameInfo', sv.serializeInfo());
        }
        if (mode === 'rename' && folder !== s.name) { closeIfOpen(s.name); await moveToTrash(s); }
        App.toast(mode === 'copy' ? '✔ انعملت نسخة جديدة: ' + folder : '✔ تغيّر الاسم: ' + folder);
        await refresh();
      } catch (e) { App.toast('ما زبط: ' + e.message + ' — تأكد إن اللعبة مسكّرة', true); console.error(e); }
    };
    inp.onkeydown = e => { if (e.key === 'Enter') go(); };
    App.modal(h('div', null,
      h('h2', null, mode === 'copy' ? '📄 نسخة جديدة من السيف' : '✏️ تغيير اسم السيف'),
      h('p', null, mode === 'copy' ? 'بتنعمل نسخة كاملة من ' : 'بتغيّر اسم ', h('b', null, s.farm || s.name), mode === 'copy' ? '، وبتطلع باللعبة كسيف لحاله. الأصلي ما بيتغيّر.' : '. القديم بيروح لسلة المحذوفات للاحتياط.'),
      h('label', null, 'الاسم الجديد (حروف وأرقام بس):'), inp, prev,
      h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '10px 0' } }, farmChk, 'غيّر اسم المزرعة جوّا اللعبة كمان'),
      err,
      h('div', { class: 'row' }, h('button', { class: 'btn btn-green', onclick: go }, mode === 'copy' ? 'اعمل النسخة' : 'غيّر الاسم'), h('button', { class: 'btn', onclick: () => App.closeModal() }, 'رجوع'))));
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
  }
  async function restoreTrash(t) {
    const orig = t.n.split('__')[0];
    if (await exists(st.root, orig, 'dir')) { App.toast('في سيف بنفس الاسم هلق (' + orig + '). غيّر اسمه أو احذفه أول.', true); return; }
    try {
      await copyDir(t.dir, await st.root.getDirectoryHandle(orig, { create: true }));
      await (await st.root.getDirectoryHandle(TRASH)).removeEntry(t.n, { recursive: true });
      App.toast('↩️ رجع السيف ' + orig); await refresh();
    } catch (e) { App.toast(e.message, true); }
  }
  async function purgeTrash(t) {
    if (!confirm(t ? 'بدك تحذف "' + t.n.split('__')[0] + '" نهائياً؟ ما في رجعة.' : 'بدك تفضّي سلة المحذوفات كلها نهائياً؟ ما في رجعة.')) return;
    try { const td = await st.root.getDirectoryHandle(TRASH); if (t) await td.removeEntry(t.n, { recursive: true }); else await st.root.removeEntry(TRASH, { recursive: true }); App.toast('انحذف نهائياً'); await refresh(); }
    catch (e) { App.toast(e.message, true); }
  }

  // ---------- pages ----------
  function shots(list, numbered) {
    return h('div', { class: 'ob-shots' }, list.map(([f, cap], i) => h('figure', { class: 'ob-shot', onclick: () => zoom(list, i) },
      h('img', { src: 'assets/guide/' + f, alt: cap, loading: 'lazy' }),
      h('figcaption', null, numbered ? h('b', null, (i + 1) + '. ') : null, cap))));
  }
  function zoom(list, i) {
    const [f, cap] = list[i];
    App.modal(h('div', { class: 'ob-zoom' }, h('img', { src: 'assets/guide/' + f, alt: cap }), h('p', null, cap),
      list.length > 1 ? h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn btn-small', disabled: i === 0, onclick: () => zoom(list, i - 1) }, '→ السابقة'),
        h('span', { class: 'muted' }, (i + 1) + ' / ' + list.length),
        h('button', { class: 'btn btn-small', disabled: i === list.length - 1, onclick: () => zoom(list, i + 1) }, 'التالية ←')) : null));
  }
  function stepCard(num, title, ...body) { return h('div', { class: 'wood card ob-step' }, h('div', { class: 'ob-num' }, num), h('div', { style: { flex: 1 } }, h('h3', null, title), ...body)); }
  function onboarding(pg) {
    const linked = /linked=1/.test(location.search);
    const pre = h('pre', { class: 'en ob-code', style: { display: 'none' } }, batText());
    pg.append(h('div', { class: 'home-hero' }, h('div', { style: { flex: 1 } },
      h('h2', null, 'أهلاً فيك بمحرر سيف ستاردو 🌱'),
      h('p', null, 'عدّل سيفك بالعربي: المصاري، المهارات، الشنطة والصناديق، العلاقات، الحيوانات، المركز المجتمعي، الخريطة والتاريخ. التعديلات بتنكتب على سيفك مباشرة، بدون ما ترفع أو تنزّل ملفات.'),
      h('div', { class: 'notice' }, '💡 أول مرة بس في خطوة صغيرة، بعدها كل ما تفتح الموقع بتلاقي سيفاتك جاهزة.'))));
    if (!FS_OK) {
      pg.append(h('div', { class: 'wood card' }, h('h3', null, 'متصفحك ما بيدعم التعديل المباشر'),
        h('p', null, 'التعديل المباشر على الملفات بيشتغل على ', h('b', null, 'Chrome'), ' أو ', h('b', null, 'Edge'), ' على الكمبيوتر. على هاد المتصفح فيك ترفع السيف وتعدّله وتنزّله zip.'),
        h('button', { class: 'btn btn-blue', onclick: () => App.openUpload() }, '📤 ارفع سيف من جهازك')));
      return;
    }
    if (!IS_WIN) {
      pg.append(stepCard('1', 'اختار مجلد السيفات',
        h('p', null, 'على ماك أو لينكس ما بتحتاج أي ملف. اضغط الزر، وبنافذة الاختيار اضغط ', h('code', { class: 'en' }, 'Cmd+Shift+G'), ' (ماك) والصق:'),
        h('pre', { class: 'en ob-code' }, '~/.config/StardewValley/Saves'),
        h('button', { class: 'btn btn-green', onclick: () => App.openFolder() }, '📂 اختار المجلد')));
      return;
    }
    pg.append(h('div', { class: 'wood card' },
      h('h3', null, '🤔 ليش في ملف لازم أنزّله؟'),
      h('p', null, 'اللعبة بتحفظ سيفاتها بمجلد ', h('code', { class: 'en' }, 'AppData'), '، وكروم بيعتبره مجلد نظام وما بيسمح لأي موقع يفتحه. هاد الملف الصغير بينقل سيفاتك لمجلد عادي اسمه ', h('code', { class: 'en' }, 'StardewSaves'), ' وبيترك مكانها "رابط"، فاللعبة بتضل تلاقيها بنفس المكان وكأنه ما صار إشي.'),
      h('ul', { class: 'ob-list' },
        h('li', null, '✅ ما بينزّل ولا بيثبّت أي برنامج، وما بيحتاج صلاحيات أدمن.'),
        h('li', null, '✅ بياخذ نسخة احتياطية كاملة من سيفاتك قبل ما يعمل أي إشي.'),
        h('li', null, '✅ هو ملف نص عادي: فيك تفتحه بالـ Notepad وتقرأ كل سطر فيه، أو تشوفه هون تحت.'),
        h('li', null, '↩️ إذا بدك ترجّع كل إشي زي ما كان: شغّله مرة ثانية واضغط ', h('b', { class: 'en' }, 'U'), '. (وإذا ضغطت ', h('b', { class: 'en' }, 'O'), ' بيفتحلك المحرر.)', shots([['already.png', 'لما تشغّله مرة ثانية: O بيفتح المحرر، U بيرجّع السيفات لمكانها الأصلي.']]))),
      h('button', { class: 'btn btn-small', onclick: e => { const v = pre.style.display === 'none'; pre.style.display = v ? '' : 'none'; e.target.textContent = v ? '🙈 خبّي محتوى الملف' : '👀 شوف شو جوّا الملف'; } }, '👀 شوف شو جوّا الملف'), pre));
    pg.append(h('div', { class: 'ob-steps' },
      stepCard('1', 'نزّل ملف الربط',
        h('p', null, 'سكّر اللعبة أول. بعدين نزّل الملف:'),
        h('button', { class: 'btn btn-green', onclick: downloadBat }, '⬇️ نزّل StardewSaves_Link.bat'),
        h('p', { class: 'muted' }, 'إذا كروم قلّك إن نوع الملف ممكن يكون خطير، اضغط ', h('b', null, 'Keep / الاحتفاظ'), '. هاد تحذير عام لكل ملفات .bat.'),
        shots([['dl_open.png', 'لما يخلص التنزيل، اضغط على الملف من قائمة التنزيلات فوق يمين بكروم.']])),
      stepCard('2', 'شغّله (دبل كليك)',
        h('p', null, 'بتطلع نافذة سودا بتخلص بثواني، وبتفتحلك هاي الصفحة من جديد لحالها.'),
        shots([['done.png', 'هيك بتطلع لما يخلص: DONE! يعني كل إشي تمام، ونسخة احتياطية من سيفاتك انحفظت.']]),
        h('p', { class: 'muted' }, 'إذا طلعت شاشة زرقا ', h('b', { class: 'en', dir: 'ltr' }, 'Windows protected your PC'), '، اضغط ', h('b', null, 'More info'), ' وبعدين ', h('b', null, 'Run anyway'), '. ويندوز بيعمل هيك مع أي ملف نازل من النت ما عليه توقيع شركة.'),
        h('div', { class: 'notice', style: { fontWeight: 500 } }, h('b', null, 'طلعتلك هاي الرسالة بدل النافذة السودا؟'), ' ويندوز قافل الملف لأنه نازل من النت. افتحه بهالخطوات:',
          shots([
            ['blocked.png', 'الرسالة: These files can\'t be opened. اضغط Close.'],
            ['downloads.png', 'افتح مجلد التنزيلات (Downloads) ولاقي الملف StardewSaves_Link.bat.'],
            ['properties_menu.png', 'كليك يمين عليه، واختار Properties / خصائص (بويندوز 11 ممكن تلاقيها تحت "Show more options").'],
            ['unblock_ok.png', 'تحت عند Security حط صح على Unblock (1)، وبعدين OK (2). هلق دبل كليك على الملف وبيشتغل.']
          ], true))),
      stepCard('3', 'اختار المجلد',
        h('p', null, 'اضغط الزر، وبنافذة الاختيار اضغط على شريط العنوان فوق واعمل ', h('b', { class: 'en' }, 'Ctrl+V'), ' (الملف نسخلك المسار) وبعدين ', h('b', null, 'Enter'), '.'),
        h('div', { class: 'notice' }, '⚠️ مهم: بعد Enter استنى لحد ما تشوف جوّا النافذة مجلدات سيفاتك (متل ', h('span', { class: 'en' }, 'MyFarm_123456789'), ')، ', h('b', null, 'وما تضغط على أي واحد منها'), '. إذا انحدد واحد، اضغط على مكان فاضي جنبه. وبعدين اضغط ', h('b', null, 'Select Folder / اختيار مجلد'), '. إذا ضغطته قبل Enter بيختار مجلد المستخدم كله، وكروم بيرفضه.'),
        h('pre', { class: 'en ob-code' }, '%USERPROFILE%\\StardewSaves'),
        shots([
          ['picker_paste.png', 'اضغط على شريط العنوان فوق والصق المسار بـ Ctrl+V. لسا ما خلصت: اضغط Enter، وتأكد إنه صار يبيّن مجلدات سيفاتك بدل هالمجلدات، وبعدين Select Folder.'],
          ['picker_ok.png', 'هيك لازم تكون: (1) فوق مكتوب StardewSaves. (2) جوّا بتشوف مجلد سيفك، يعني إنت بالمكان الصح، بس ما تضغط عليه. (3) إذا خانة Folder فيها اسم سيف، يعني انحدد: اضغط على مكان فاضي. (4) اضغط Select Folder.'],
          ['allow.png', 'آخر إشي: كروم بيسألك إذا بتسمح للموقع يعدّل الملفات بـ StardewSaves. اضغط Allow.'],
          ['wrong_folder.png', 'طلعتلك هاي؟ يعني انختار مجلد المستخدم كله أو AppData بدل StardewSaves (غالباً انضغط Select Folder قبل Enter). اضغط Choose a different folder، الصق المسار، Enter، وبعدين Select Folder.']
        ]),
        h('p', { class: 'muted' }, 'كروم رح يسألك إذا بتسمح بالتعديل: اختار ', h('b', null, 'Allow on every visit / السماح في كل زيارة'), ' إذا ظهر، عشان ما يسألك كل مرة.'),
        h('button', { class: 'btn btn-green' + (linked ? ' ob-pulse' : ''), onclick: () => App.openFolder() }, '📂 اختار المجلد'))));
    pg.append(h('p', { class: 'muted', style: { marginTop: '14px' } }, 'ما بدك تنزّل إشي؟ ', h('a', { href: '#', onclick: e => { e.preventDefault(); App.openUpload(); } }, 'ارفع سيفك وعدّله ونزّله zip'), ' بدالها.'));
    if (linked) setTimeout(() => { const b = document.querySelector('.ob-pulse'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200);
  }
  function home(pg) {
    if (st.uploadMode || (!O.ready && !O.needClick)) { if (st.uploadMode) return uploadHome(pg); return onboarding(pg); }
    if (O.needClick) {
      pg.append(h('div', { class: 'home-hero' }, h('div', { style: { flex: 1 } },
        h('h2', null, 'أهلاً من جديد 👋'),
        h('p', null, 'كروم بده تأكيد صغير قبل ما يفتح سيفاتك.'),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-green ob-pulse', onclick: async () => App.openFolder(await App.idb('get')) }, '▶ افتح سيفاتي'), h('button', { class: 'btn btn-small', onclick: () => App.openFolder() }, 'اختار مجلد ثاني')))));
      return;
    }
    pg.append(h('div', { class: 'home-hero' }, h('div', { style: { flex: 1 } },
      h('h2', null, 'سيفاتك 🌾'),
      O.single ? h('div', { class: 'notice' }, 'ℹ️ اخترت مجلد سيف واحد، فبتقدر تعدّله عادي. بس عشان تشوف كل سيفاتك وتقدر تنسخ وتغيّر الأسامي وتحذف، اضغط "📂 مجلد ثاني" واختار ', h('span', { class: 'en' }, 'StardewSaves'), ' نفسه (بدون ما تحدد أي مجلد جوّاه).') : null,
      h('div', { class: 'notice' }, '⚠️ سكّر اللعبة قبل ما تحفظ أو تحذف. وإذا طلعلك تنبيه Steam Cloud لما تفتح اللعبة اختار ', h('b', null, 'Local'), '.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => refresh() }, '🔄 حدّث'), h('button', { class: 'btn btn-small', onclick: () => App.openFolder() }, '📂 مجلد ثاني'), h('button', { class: 'btn btn-small btn-blue', onclick: () => App.openUpload() }, '📤 ارفع سيف')))));
    if (!st.saves.length) pg.append(h('div', { class: 'empty' }, 'ما في سيفات هون لسا. اعمل مزرعة باللعبة واحفظ، وبتطلع هون لحالها.'));
    pg.append(h('div', { class: 'savelist' }, st.saves.map(s => h('div', { class: 'wood savecard' + (st.saveName === s.name ? ' sel' : ''), onclick: () => App.loadSave(s) },
      h('div', { class: 'row' }, h('span', { style: { fontSize: '28px' } }, '🌾'), h('div', null, h('b', { style: { fontSize: '18px' } }, s.farm || s.name), h('div', { class: 'muted en' }, s.name))),
      h('div', { class: 'kv', style: { marginTop: '6px' } }, h('b', null, 'اللاعب'), h('span', null, s.player || '-'), h('b', null, 'التاريخ'), h('span', null, `${['الربيع', 'الصيف', 'الخريف', 'الشتاء'][s.season] || ''} ${s.day || ''}، سنة ${s.year || ''}`), h('b', null, 'المصاري'), h('span', null, (s.money || 0).toLocaleString() + 'g')),
      h('div', { class: 'row card-actions', onclick: e => e.stopPropagation() },
        h('button', { class: 'btn btn-small btn-green', onclick: () => App.loadSave(s) }, '✏️ عدّل'),
        O.single ? null : [
        h('button', { class: 'btn btn-small', onclick: () => askName(s, 'rename') }, '🏷️ غيّر الاسم'),
        h('button', { class: 'btn btn-small', onclick: () => askName(s, 'copy') }, '📄 نسخة'),
        h('button', { class: 'btn btn-small btn-red', onclick: () => askDelete(s) }, '🗑️')])))));
    if (st.save) {
      const box = h('div', null, h('h3', null, 'النسخ الاحتياطية لـ ', h('span', { class: 'en' }, st.saveName)), h('div', { class: 'muted' }, 'جاري التحميل…'));
      pg.append(box);
      App.listBackups().then(list => { box.lastChild.remove(); if (!list.length) box.append(h('div', { class: 'muted' }, 'لسا ما في نسخ (بتنعمل لحالها كل ما تحفظ).')); else box.append(h('table', null, h('tbody', null, list.map(b => h('tr', null, h('td', { class: 'en' }, b.n), h('td', null, h('button', { class: 'btn btn-small', onclick: () => App.restoreBackup(b) }, 'رجّع هاي النسخة'))))))); });
    }
    if (O.trash.length) {
      pg.append(h('details', { class: 'wood card', style: { marginTop: '14px' } }, h('summary', null, h('b', null, `🗑️ سلة المحذوفات (${O.trash.length})`)),
        h('table', null, h('tbody', null, O.trash.map(t => h('tr', null, h('td', { class: 'en' }, t.n.split('__')[0]), h('td', { class: 'muted en' }, (t.n.split('__')[1] || '').replace('_', ' ')),
          h('td', null, h('button', { class: 'btn btn-small btn-green', onclick: () => restoreTrash(t) }, '↩️ رجّعه'), ' ', h('button', { class: 'btn btn-small btn-red', onclick: () => purgeTrash(t) }, 'احذف نهائياً')))))),
        h('button', { class: 'btn btn-small btn-red', style: { marginTop: '8px' }, onclick: () => purgeTrash(null) }, 'فضّي السلة')));
    }
  }
  function uploadHome(pg) {
    pg.append(h('div', { class: 'home-hero' }, h('div', { style: { flex: 1 } },
      h('h2', null, '📤 سيف مرفوع'),
      h('p', null, 'عم تعدّل على سيف رفعته. لما تخلص اضغط "احفظ التعديلات" وبينزل zip.'),
      h('div', { class: 'row' }, h('button', { class: 'btn btn-blue', onclick: () => App.openUpload() }, 'ارفع سيف ثاني'), FS_OK ? h('button', { class: 'btn', onclick: () => { st.uploadMode = null; st.save = null; App.markDirty(); App.render(); } }, '↩ رجوع للتعديل المباشر') : null))));
  }
  App.pages.home = home;

  // ---------- start ----------
  const css = document.createElement('style');
  css.textContent = `
.ob-steps{display:grid;grid-template-columns:1fr;gap:12px;margin-top:12px}
.ob-shots{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0}
.ob-shot{margin:0;flex:1 1 240px;max-width:460px;background:#fff8e1;border:3px solid #8a5a2b;border-radius:6px;padding:6px;cursor:zoom-in;box-shadow:0 3px 0 rgba(0,0,0,.2);transition:transform .15s}
.ob-shot:hover{transform:translateY(-2px)}
.ob-shot img{display:block;width:100%;height:auto;border-radius:3px;background:#111}
.ob-shot figcaption{font-size:14px;margin-top:6px;line-height:1.6;color:var(--ink,#3b2412)}
.modal-box:has(.ob-zoom){width:min(94vw,1150px);max-width:94vw;overflow-x:hidden}
.ob-zoom img{display:block;width:100%;max-width:100%;max-height:72vh;object-fit:contain;margin:0 auto;border-radius:4px}
.ob-zoom p{text-align:center;font-weight:700}
.ob-step{display:flex;gap:12px;align-items:flex-start}
.ob-num{flex:none;width:42px;height:42px;border-radius:50%;background:var(--green,#5a8f29);color:#fff;font:700 24px 'Pixelify Sans',sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 0 rgba(0,0,0,.3)}
.ob-code{background:#2b1d10;color:#ffe9b0;padding:10px;border-radius:6px;direction:ltr;text-align:left;white-space:pre-wrap;word-break:break-all;font-size:13px;max-height:340px;overflow:auto}
.ob-list{line-height:1.9;padding-inline-start:18px;margin:8px 0}
.ob-pulse{animation:obp 1.2s ease-in-out infinite}
@keyframes obp{50%{transform:scale(1.06)}}
.card-actions{margin-top:8px;gap:6px;flex-wrap:wrap}
.card-actions .btn{white-space:nowrap}
.savelist .savecard{min-width:300px}
.savecard.sel{outline:3px solid #ffd34d}
details.card summary{cursor:pointer;padding:4px 0}
@media (max-width:560px){.ob-step{flex-direction:column}}`;
  document.head.append(css);
  document.getElementById('btnOpen').textContent = '🏠 سيفاتي';
  document.getElementById('btnOpen').onclick = () => { st.tab = 'home'; if (O.ready) refresh(); else App.render(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && O.ready) refresh(true); });
  (async () => {
    if (!FS_OK) { App.render(); return; }
    const d = await App.idb('get');
    if (d) {
      let p = 'prompt'; try { p = await d.queryPermission({ mode: 'readwrite' }); } catch (e) { }
      if (p === 'granted') { await App.openFolder(d); return; }
      O.needClick = true;
    }
    App.render();
  })();
})();
