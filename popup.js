// ═══════════════════════════════════════════════════
//  GCP TOOLS by ERZA  —  popup.js  v3.0.2
// ═══════════════════════════════════════════════════

// ── View navigation ───────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// Sync domain across all views
function syncDomain(val) {
  ['launcher-domain','cpt-domain','high-domain','race-domain'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value !== val) el.value = val;
  });
  chrome.storage.local.set({ gamecp_domain: val });
}

document.querySelectorAll('.inp-domain-field').forEach(el => {
  el.addEventListener('change', () => {
    const val = el.value.trim()
      .replace(/https?:\/\//g,'')
      .replace(/\.gamecp\.net.*/,'')
      .replace(/\s/g,'');
    el.value = val;
    syncDomain(val);
  });
});

chrome.storage.local.get('gamecp_domain', (data) => {
  if (data.gamecp_domain) syncDomain(data.gamecp_domain);
});

// Nav buttons
document.getElementById('goto-cpt').addEventListener('click', () => showView('view-cpt'));
document.getElementById('goto-high').addEventListener('click', () => showView('view-high'));
document.getElementById('back-from-cpt').addEventListener('click', () => showView('view-launcher'));
document.getElementById('back-from-high').addEventListener('click', () => showView('view-launcher'));

// ── Utility ───────────────────────────────────────
function log(box, msg, type = 'info') {
  const span = document.createElement('span');
  span.className = 'log-' + type;
  span.textContent = msg;
  box.appendChild(span);
  box.appendChild(document.createElement('br'));
  box.scrollTop = box.scrollHeight;
}
function clearLog(box) { box.innerHTML = ''; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function getDomain(inputId) {
  return (document.getElementById(inputId).value.trim() || 'warden') + '.gamecp.net';
}
function getNames(textareaId) {
  return document.getElementById(textareaId).value.trim()
    .split('\n').map(n => n.trim()).filter(n => n.length > 0);
}

// ══════════════════════════════════════════════════
//  BULK CPT — original logic (preserved)
// ══════════════════════════════════════════════════

// batch quick-select buttons
const batchInput = document.getElementById('inp-batch');
document.querySelectorAll('#cpt-batch-btns .batch-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#cpt-batch-btns .batch-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    batchInput.value = btn.dataset.val;
  });
});
batchInput.addEventListener('input', () => {
  const val = batchInput.value;
  document.querySelectorAll('#cpt-batch-btns .batch-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === val);
  });
});

const btnRun   = document.getElementById('btn-run');
const btnStop  = document.getElementById('btn-stop');
const logBox   = document.getElementById('log-box');
const progBar  = document.getElementById('progress-wrap');
const progFill = document.getElementById('progress-fill');
const progText = document.getElementById('progress-text');

let cptRunning = false, cptStopFlag = false;
let cptActiveTabs = new Set();
let cptDone = 0, cptTotal = 0;

function setCptProgress(current, total) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  progFill.style.width = pct + '%';
  progText.textContent = `${current} / ${total}`;
}

btnStop.addEventListener('click', () => {
  cptStopFlag = true;
  log(logBox, '⏹ Stop diminta...', 'err');
  cptActiveTabs.forEach(id => chrome.tabs.remove(id).catch(() => {}));
  cptActiveTabs.clear();
});

btnRun.addEventListener('click', async () => {
  if (cptRunning) return;
  clearLog(logBox);

  const namesRaw  = document.getElementById('inp-names').value.trim();
  const level     = document.getElementById('inp-level').value.trim();
  const cpt       = document.getElementById('inp-cpt').value.trim();
  const totalpt   = document.getElementById('inp-totalpt').value.trim();
  const weeklypt  = document.getElementById('inp-weeklypt').value.trim();
  const delay     = parseInt(document.getElementById('inp-delay').value) * 1000;
  const batchSize = Math.max(1, Math.min(10, parseInt(batchInput.value) || 1));
  const doLevel   = document.getElementById('chk-level').checked;
  const doCpt     = document.getElementById('chk-cpt').checked;
  const doTotalPt = document.getElementById('chk-totalpt').checked;
  const doWeeklyPt= document.getElementById('chk-weeklypt').checked;
  const domain    = getDomain('cpt-domain');

  if (!namesRaw)                                       { log(logBox, 'Masukkan nickname dulu!', 'err'); return; }
  if (!doLevel && !doCpt && !doTotalPt && !doWeeklyPt) { log(logBox, 'Pilih minimal satu opsi!', 'err'); return; }

  const names = namesRaw.split('\n').map(n => n.trim()).filter(n => n.length > 0);
  if (names.length === 0) { log(logBox, 'Tidak ada nickname valid.', 'err'); return; }

  cptRunning = true; cptStopFlag = false; cptDone = 0; cptTotal = names.length;
  btnRun.disabled = true; btnStop.style.display = 'block'; progBar.style.display = 'block';
  setCptProgress(0, cptTotal);

  const batches = [];
  for (let i = 0; i < names.length; i += batchSize) batches.push(names.slice(i, i + batchSize));
  log(logBox, `Mulai ${cptTotal} player → ${batches.length} batch x ${batchSize} paralel`, 'info');

  let successCount = 0, errorCount = 0;

  for (let b = 0; b < batches.length; b++) {
    if (cptStopFlag) break;
    const batch = batches[b];
    log(logBox, `── Batch ${b+1}/${batches.length} [${batch.join(', ')}]`, 'info');

    const results = await Promise.allSettled(
      batch.map((nick, idx) => sleep(idx * 1000).then(() =>
        processPlayer(nick, level, cpt, totalpt, weeklypt, delay, doLevel, doCpt, doTotalPt, doWeeklyPt, domain)
      ))
    );

    results.forEach((r, idx) => {
      const nick = batch[idx];
      if (r.status === 'fulfilled') {
        const res = r.value;
        if (res.ok) {
          successCount++;
          log(logBox, `  [OK] ${nick}: ${res.msg}`, 'ok');
          if (res.skipped) log(logBox, `     skip: ${res.skipped}`, 'info');
        } else if (res.online) {
          log(logBox, `  [ONLINE] ${nick}: character sedang online`, 'info');
        } else {
          errorCount++;
          log(logBox, `  [GAGAL] ${nick}: ${res.msg}`, 'err');
        }
      } else {
        errorCount++;
        log(logBox, `  [ERROR] ${nick}: ${r.reason?.message || 'error'}`, 'err');
      }
      cptDone++;
      setCptProgress(cptDone, cptTotal);
    });

    if (b < batches.length - 1 && !cptStopFlag) await sleep(800);
  }

  cptRunning = false;
  btnRun.disabled = false; btnStop.style.display = 'none';
  log(logBox, `${cptStopFlag ? 'Dihentikan' : 'Selesai'}! Berhasil: ${successCount}, Gagal: ${errorCount}`, successCount > 0 ? 'ok' : 'err');
});

// ── CPT: processPlayer & helpers (original) ───────

async function processPlayer(nick, level, cpt, totalpt, weeklypt, delay, doLevel, doCpt, doTotalPt, doWeeklyPt, domain) {
  const url = `https://${domain}/index.php?do=admin_adm_edit_character&character_serial=&character_name=${encodeURIComponent(nick)}&search_fun=asu`;
  let tabId = null;
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id; cptActiveTabs.add(tabId);
    await waitForTabLoad(tabId);
    if (cptStopFlag) throw new Error('dihentikan');
    await sleep(800);

    const r1 = await chrome.scripting.executeScript({
      target: { tabId }, func: fillForm,
      args: [doLevel ? level : null, doCpt ? cpt : null, doTotalPt ? totalpt : null, doWeeklyPt ? weeklypt : null]
    });
    const res = r1[0]?.result;
    if (!res)                        throw new Error('Tidak ada response dari halaman');
    if (res.status === 'not_found')  return { ok: false, msg: 'Player tidak ditemukan' };
    if (res.status === 'online')     return { ok: false, online: true };
    if (res.status === 'skipped_all') return { ok: true, msg: `sudah diatas target (${res.skipped.join(', ')})` };
    if (res.status === 'error')      return { ok: false, msg: res.msg };

    const r2 = await chrome.scripting.executeScript({ target: { tabId }, func: clickUpdate, args: [delay] });
    const clickRes = r2[0]?.result;
    if (!clickRes || clickRes.status !== 'clicked') {
      const keepId = tabId; tabId = null; cptActiveTabs.delete(keepId);
      return { ok: false, msg: `Gagal klik Update: ${clickRes?.msg || 'unknown'} — tab dibiarkan terbuka` };
    }

    await waitForPageReload(tabId, 20000);
    await sleep(400);

    const result = await readResultWithRetry(tabId, { ...res, nick, domain }, doLevel ? level : null, doCpt ? cpt : null, doTotalPt ? totalpt : null, doWeeklyPt ? weeklypt : null, delay);
    if (result.ok !== undefined) return result;

    const keepId = tabId; tabId = null; cptActiveTabs.delete(keepId);
    return { ok: false, msg: `${result.msg || 'Response tidak dikenali'} — tab dibiarkan terbuka` };

  } finally {
    if (tabId) { await sleep(200); chrome.tabs.remove(tabId).catch(() => {}); cptActiveTabs.delete(tabId); }
  }
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Tab timeout')), 30000);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function waitForPageReload(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Reload timeout')), timeoutMs);
    let phase = 'wait_loading';
    function listener(id, info) {
      if (id !== tabId) return;
      if (phase === 'wait_loading' && info.status === 'loading') { phase = 'wait_complete'; return; }
      if (phase === 'wait_complete' && info.status === 'complete') {
        clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(async () => {
      if (phase === 'wait_loading') {
        try {
          const check = await chrome.scripting.executeScript({ target: { tabId }, func: () => document.readyState });
          if (check[0]?.result === 'complete') { clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve(); }
        } catch(_) {}
      }
    }, 3000);
  });
}

function fillForm(levelVal, cptVal, totalPtVal, weeklyPtVal) {
  try {
    const levelInput    = document.querySelector('#porm > table > tbody > tr:nth-child(8) > td > input');
    const cptInput      = document.querySelector('#porm > table > tbody > tr:nth-child(18) > td > input');
    const totalPtInput  = document.querySelector('#porm > table > tbody > tr:nth-child(13) > td > input');
    const weeklyPtInput = document.querySelector('#porm > table > tbody > tr:nth-child(14) > td > input');
    if (!levelInput && !cptInput && !totalPtInput && !weeklyPtInput) return { status: 'not_found' };
    const bodyText = (document.body.innerText || '').toLowerCase();
    if (bodyText.includes('currently online') || bodyText.includes('need to offline') || bodyText.includes('stuck')) return { status: 'online' };
    const skipped = [], changed = [];
    let anyChanged = false;
    if (levelVal !== null && levelInput) {
      const cur = parseInt(levelInput.value) || 0, tgt = parseInt(levelVal);
      if (cur < tgt) { levelInput.value = levelVal; levelInput.dispatchEvent(new Event('input',{bubbles:true})); levelInput.dispatchEvent(new Event('change',{bubbles:true})); changed.push(`LVL ${cur}->${tgt}`); anyChanged = true; }
      else skipped.push(`LVL ${cur}`);
    }
    if (cptVal !== null && cptInput) {
      const cur = parseInt(cptInput.value) || 0, tgt = parseInt(cptVal);
      if (cur < tgt) { cptInput.value = cptVal; cptInput.dispatchEvent(new Event('input',{bubbles:true})); cptInput.dispatchEvent(new Event('change',{bubbles:true})); changed.push(`CPT ${cur}->${tgt}`); anyChanged = true; }
      else skipped.push(`CPT ${cur}`);
    }
    if (totalPtVal !== null && totalPtInput) {
      const cur = parseInt(totalPtInput.value) || 0, tgt = parseInt(totalPtVal);
      if (cur < tgt) { totalPtInput.value = totalPtVal; totalPtInput.dispatchEvent(new Event('input',{bubbles:true})); totalPtInput.dispatchEvent(new Event('change',{bubbles:true})); changed.push(`TotalPT ${cur}->${tgt}mnt`); anyChanged = true; }
      else skipped.push(`TotalPT ${cur}mnt`);
    }
    if (weeklyPtVal !== null && weeklyPtInput) {
      const cur = parseInt(weeklyPtInput.value) || 0, tgt = parseInt(weeklyPtVal);
      if (cur < tgt) { weeklyPtInput.value = weeklyPtVal; weeklyPtInput.dispatchEvent(new Event('input',{bubbles:true})); weeklyPtInput.dispatchEvent(new Event('change',{bubbles:true})); changed.push(`WeeklyPT ${cur}->${tgt}mnt`); anyChanged = true; }
      else skipped.push(`WeeklyPT ${cur}mnt`);
    }
    if (!anyChanged) return { status: 'skipped_all', skipped };
    return { status: 'ok', changed, skipped };
  } catch(e) { return { status: 'error', msg: e.message }; }
}

function clickUpdate(maxWaitMs) {
  return new Promise((resolve) => {
    const MAX_TRIES = Math.ceil(maxWaitMs / 500);
    const btn = document.querySelector('#ok-gas');
    if (!btn) return resolve({ status: 'error', msg: 'Tombol #ok-gas tidak ditemukan' });
    if (!btn.disabled) { btn.click(); return resolve({ status: 'clicked' }); }
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      const b = document.querySelector('#ok-gas');
      if (b && !b.disabled) { clearInterval(iv); b.click(); resolve({ status: 'clicked' }); }
      else if (tries >= MAX_TRIES) { clearInterval(iv); resolve({ status: 'error', msg: `Tombol masih disabled setelah ${maxWaitMs/1000}s` }); }
    }, 500);
  });
}

function readResult() {
  const bodyText = (document.body.innerText || '').toLowerCase();
  if (bodyText.includes('currently online') || bodyText.includes('need to offline') || bodyText.includes('stuck')) return { status: 'online' };
  if (bodyText.includes('please refresh') || bodyText.includes('refresh the page')) return { status: 'need_refresh', msg: 'Server minta refresh' };
  const selectors = ['.alert-success','.alert-danger','.alert','#rzr > div > div > div > div > div > div','[class*="success"]','[class*="error"]','[class*="alert"]'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const text = (el.innerText || el.textContent || '').trim();
    if (!text) continue;
    const t = text.toLowerCase();
    if (t.includes('please refresh') || t.includes('refresh the page')) return { status: 'need_refresh', msg: 'Server minta refresh' };
    if (t.includes('successfully edit character') || t.includes('success')) return { status: 'success' };
    if (t.includes('currently online') || t.includes('need to offline')) return { status: 'online' };
    return { status: 'error', msg: text.substring(0, 100) };
  }
  if (bodyText.includes('successfully edit character') || bodyText.includes('success')) return { status: 'success' };
  return { status: 'error', msg: 'Result element tidak ditemukan' };
}

async function readResultWithRetry(tabId, formRes, levelVal, cptVal, totalPtVal, weeklyPtVal, delay) {
  const r = await chrome.scripting.executeScript({ target: { tabId }, func: readResult, args: [] });
  const result = r[0]?.result;
  if (result?.status === 'success') return { ok: true, msg: formRes.changed?.join(', ') || 'diupdate', skipped: formRes.skipped?.length ? formRes.skipped.join(', ') : null };
  if (result?.status === 'online') return { ok: false, online: true };
  if (result?.status === 'need_refresh') {
    log(logBox, `  ↻ Server minta refresh — navigasi ulang...`, 'info');
    const freshUrl = `https://${formRes.domain || 'warden.gamecp.net'}/index.php?do=admin_adm_edit_character&character_serial=&character_name=${encodeURIComponent(formRes.nick || '')}&search_fun=asu`;
    await chrome.tabs.update(tabId, { url: freshUrl });
    await waitForTabLoad(tabId); await sleep(800);
    const r2 = await chrome.scripting.executeScript({ target: { tabId }, func: fillForm, args: [levelVal, cptVal, totalPtVal, weeklyPtVal] });
    const res2 = r2[0]?.result;
    if (!res2 || res2.status === 'not_found') return { msg: 'Player tidak ditemukan setelah refresh' };
    if (res2.status === 'online') return { ok: false, online: true };
    if (res2.status === 'skipped_all') return { ok: true, msg: `sudah diatas target (${res2.skipped.join(', ')})` };
    if (res2.status === 'error') return { msg: res2.msg };
    log(logBox, `  ⏳ Menunggu Cloudflare (${delay/1000}s)...`, 'info');
    const r3 = await chrome.scripting.executeScript({ target: { tabId }, func: clickUpdate, args: [delay] });
    const clickRes = r3[0]?.result;
    if (!clickRes || clickRes.status !== 'clicked') return { msg: `Gagal klik Update setelah refresh: ${clickRes?.msg || 'unknown'}` };
    await waitForPageReload(tabId, 20000); await sleep(400);
    const r4 = await chrome.scripting.executeScript({ target: { tabId }, func: readResult, args: [] });
    const result2 = r4[0]?.result;
    if (result2?.status === 'success') return { ok: true, msg: (res2.changed?.join(', ') || 'diupdate') + ' (setelah refresh)', skipped: res2.skipped?.length ? res2.skipped.join(', ') : null };
    if (result2?.status === 'online') return { ok: false, online: true };
    return { msg: result2?.msg || 'Masih gagal setelah retry' };
  }
  return { msg: result?.msg || 'Response tidak dikenali' };
}

// ══════════════════════════════════════════════════
//  BULK INSERT HIGH
// ══════════════════════════════════════════════════

const highBatchInput = document.getElementById('high-batch');
document.querySelectorAll('#high-batch-btns .batch-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#high-batch-btns .batch-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    highBatchInput.value = btn.dataset.val;
  });
});
highBatchInput.addEventListener('input', () => {
  const val = highBatchInput.value;
  document.querySelectorAll('#high-batch-btns .batch-btn').forEach(b => b.classList.toggle('active', b.dataset.val === val));
});

// Max claim quick-select buttons
const maxClaimInput = document.getElementById('high-maxclaim');
function syncMaxClaimBtns() {
  const val = maxClaimInput.value;
  document.querySelectorAll('[data-maxclaim]').forEach(b => b.classList.toggle('active', b.dataset.maxclaim === val));
}
document.querySelectorAll('[data-maxclaim]').forEach(btn => {
  btn.addEventListener('click', () => {
    maxClaimInput.value = btn.dataset.maxclaim;
    syncMaxClaimBtns();
  });
});
maxClaimInput.addEventListener('input', syncMaxClaimBtns);
syncMaxClaimBtns();

const highBtnRun   = document.getElementById('high-btn-run');
const highBtnStop  = document.getElementById('high-btn-stop');
const highLogBox   = document.getElementById('high-log-box');
const highProgWrap = document.getElementById('high-progress-wrap');
const highProgFill = document.getElementById('high-progress-fill');
const highProgText = document.getElementById('high-progress-text');

let highRunning = false, highStopFlag = false;
let highActiveTabs = new Set();
let highDone = 0, highTotal = 0;

function setHighProgress(current, total) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  highProgFill.style.width = pct + '%';
  highProgText.textContent = `${current} / ${total}`;
}

highBtnStop.addEventListener('click', () => {
  highStopFlag = true;
  log(highLogBox, '⏹ Stop diminta...', 'err');
  highActiveTabs.forEach(id => chrome.tabs.remove(id).catch(() => {}));
  highActiveTabs.clear();
});

highBtnRun.addEventListener('click', async () => {
  if (highRunning) return;
  clearLog(highLogBox);

  const names = getNames('high-names');
  const batchSize = Math.max(1, Math.min(5, parseInt(highBatchInput.value) || 1));
  const delayMs = parseInt(document.getElementById('high-delay').value) * 1000;
  const maxClaim = Math.max(1, parseInt(document.getElementById('high-maxclaim').value) || 1);
  const domain = getDomain('high-domain');

  if (names.length === 0) { log(highLogBox, 'Masukkan nickname dulu!', 'err'); return; }

  highRunning = true; highStopFlag = false; highDone = 0; highTotal = names.length;
  highBtnRun.disabled = true; highBtnStop.style.display = 'block'; highProgWrap.style.display = 'block';
  setHighProgress(0, highTotal);

  const batches = [];
  for (let i = 0; i < names.length; i += batchSize) batches.push(names.slice(i, i + batchSize));
  log(highLogBox, `Mulai ${highTotal} player → ${batches.length} batch x ${batchSize} paralel | Max Claim: ${maxClaim}`, 'info');

  let successCount = 0, skippedCount = 0, errorCount = 0;

  for (let b = 0; b < batches.length; b++) {
    if (highStopFlag) break;
    const batch = batches[b];
    log(highLogBox, `── Batch ${b+1}/${batches.length} [${batch.join(', ')}]`, 'info');

    const results = await Promise.allSettled(
      batch.map((nick, idx) => sleep(idx * 800).then(() => processHighInsert(nick, domain, maxClaim)))
    );

    results.forEach((r, idx) => {
      const nick = batch[idx];
      if (r.status === 'fulfilled') {
        const res = r.value;
        if (res.status === 'success') { successCount++; log(highLogBox, `  [OK] ${nick}: berhasil diinsert`, 'ok'); }
        else if (res.status === 'already') { skippedCount++; log(highLogBox, `  [SKIP] ${nick}: sudah claim ${res.claimInfo || ''}`, 'warn'); }
        else { errorCount++; log(highLogBox, `  [GAGAL] ${nick}: ${res.msg}`, 'err'); }
      } else {
        errorCount++;
        log(highLogBox, `  [ERROR] ${nick}: ${r.reason?.message || 'error'}`, 'err');
      }
      highDone++;
      setHighProgress(highDone, highTotal);
    });

    if (b < batches.length - 1 && !highStopFlag) await sleep(delayMs);
  }

  highRunning = false;
  highBtnRun.disabled = false; highBtnStop.style.display = 'none';
  log(highLogBox, `${highStopFlag ? 'Dihentikan' : 'Selesai'}! OK: ${successCount}, Skip: ${skippedCount}, Gagal: ${errorCount}`, successCount > 0 ? 'ok' : 'err');
});

async function processHighInsert(nick, domain, maxClaim = 1) {
  const url = `https://${domain}/index.php?do=admin_insert_paket_high&charname=${encodeURIComponent(nick)}`;
  let tabId = null;
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id; highActiveTabs.add(tabId);
    await waitForHighTabLoad(tabId);
    if (highStopFlag) throw new Error('dihentikan');
    await sleep(600);

    // Check apakah sudah claim (baca status halaman dulu)
    const checkResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: checkHighStatus,
      args: [maxClaim]
    });
    const status = checkResult[0]?.result;

    if (!status) throw new Error('Tidak ada response dari halaman');
    if (status.alreadyClaimed) return { status: 'already', claimInfo: status.claimInfo };
    if (status.notFound) return { status: 'error', msg: 'Character tidak ditemukan' };
    if (status.error) return { status: 'error', msg: status.error };

    // Klik tombol insert
    const clickResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: clickHighInsert
    });
    const clicked = clickResult[0]?.result;
    if (!clicked || clicked.status === 'not_found') {
      return { status: 'error', msg: clicked?.msg || 'Tombol insert tidak ditemukan' };
    }

    // Tunggu halaman reload
    await waitForHighReload(tabId, 15000);
    await sleep(400);

    // Baca hasil
    const finalResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: readHighResult
    });
    const finalRes = finalResult[0]?.result;

    if (finalRes?.status === 'success') return { status: 'success' };
    if (finalRes?.status === 'already') return { status: 'already' };
    return { status: 'error', msg: finalRes?.msg || 'Gagal membaca hasil' };

  } finally {
    if (tabId) { await sleep(200); chrome.tabs.remove(tabId).catch(() => {}); highActiveTabs.delete(tabId); }
  }
}

function waitForHighTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Tab timeout')), 30000);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function waitForHighReload(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Reload timeout')), timeoutMs);
    let phase = 'wait_loading';
    function listener(id, info) {
      if (id !== tabId) return;
      if (phase === 'wait_loading' && info.status === 'loading') { phase = 'wait_complete'; return; }
      if (phase === 'wait_complete' && info.status === 'complete') {
        clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(async () => {
      if (phase === 'wait_loading') {
        try {
          const check = await chrome.scripting.executeScript({ target: { tabId }, func: () => document.readyState });
          if (check[0]?.result === 'complete') { clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve(); }
        } catch(_) {}
      }
    }, 3000);
  });
}

// Dijalankan di dalam halaman — cek status sebelum klik insert
// maxClaim = batas maksimum claim yang diizinkan (dari setting user)
function checkHighStatus(maxClaim) {
  try {
    // ── Baca Claim Count pakai selector spesifik dari halaman ──
    // Selector: #rzr > ... > table.table-bordered > tbody > tr:nth-child(1) > td
    // Nilai contoh: "» 2/2"
    const claimCell = document.querySelector(
      "#rzr > div > div > div > div > form:nth-child(9) > table.table.table-bordered.table-condensed.table-hover > tbody > tr:nth-child(1) > td"
    );

    if (claimCell) {
      const rawText = (claimCell.innerText || claimCell.textContent || '').trim();
      // Format: "» 2/2" atau "✓ 1/2" atau "1/2"
      const match = rawText.match(/(\d+)\s*\/\s*(\d+)/);
      if (match) {
        const current = parseInt(match[1]);
        const pageMax = parseInt(match[2]);
        const limit   = parseInt(maxClaim) || 1;
        if (current >= limit) {
          return {
            alreadyClaimed: true,
            claimInfo: `(${current}/${pageMax}, limit kamu: ${limit})`
          };
        }
        // Masih bisa claim
        return { ready: true, claimCount: current };
      }
    }

    // Fallback: scan rows tabel jika selector utama tidak ketemu
    const rows = document.querySelectorAll('table tr');
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        const label = (cells[0].innerText || cells[0].textContent || '').trim().toLowerCase();
        if (label === 'claim count' || label.includes('claim count')) {
          const val = (cells[1].innerText || cells[1].textContent || '').trim();
          const match = val.match(/(\d+)\s*\/\s*(\d+)/);
          if (match) {
            const current = parseInt(match[1]);
            const pageMax = parseInt(match[2]);
            const limit   = parseInt(maxClaim) || 1;
            if (current >= limit) {
              return {
                alreadyClaimed: true,
                claimInfo: `(${current}/${pageMax}, limit kamu: ${limit})`
              };
            }
            return { ready: true, claimCount: current };
          }
          break;
        }
      }
    }

    // Cek player tidak ditemukan
    const bodyText = (document.body.innerText || '').toLowerCase();
    if (bodyText.includes('not found') || bodyText.includes('tidak ditemukan') ||
        bodyText.includes('no character')) {
      return { notFound: true };
    }

    // Cek tombol insert ada
    const btn = document.querySelector(
      "#rzr > div > div > div > div > form:nth-child(9) > table:nth-child(2) > tbody:nth-child(3) > tr > td > input"
    );
    if (!btn) {
      const fallback = document.querySelector('input[type="submit"]') ||
                       document.querySelector('input[value*="Insert"]') ||
                       document.querySelector('input[value*="insert"]');
      if (!fallback) return { error: 'Tombol insert tidak ditemukan di halaman' };
    }

    return { ready: true };
  } catch(e) {
    return { error: e.message };
  }
}
// Dijalankan di dalam halaman — klik tombol insert
function clickHighInsert() {
  try {
    // Coba selector utama dulu
    let btn = document.querySelector("#rzr > div > div > div > div > form:nth-child(9) > table:nth-child(2) > tbody:nth-child(3) > tr > td > input");
    if (!btn) {
      // Fallback: cari semua submit button
      btn = document.querySelector('input[type="submit"]') ||
            document.querySelector('input[value*="Insert"]') ||
            document.querySelector('input[value*="insert"]') ||
            document.querySelector('button[type="submit"]');
    }
    if (!btn) return { status: 'not_found', msg: 'Tombol insert tidak ada' };
    btn.click();
    return { status: 'clicked' };
  } catch(e) {
    return { status: 'error', msg: e.message };
  }
}

// Dijalankan di dalam halaman — baca hasil setelah submit
function readHighResult() {
  try {
    const bodyText = (document.body.innerText || document.body.textContent || '').toLowerCase();

    if (bodyText.includes('already') || bodyText.includes('sudah') ||
        bodyText.includes('have been') || bodyText.includes('claimed')) {
      return { status: 'already' };
    }
    if (bodyText.includes('success') || bodyText.includes('berhasil') ||
        bodyText.includes('inserted') || bodyText.includes('insert')) {
      // Pastikan bukan halaman form awal
      const form = document.querySelector("form");
      const hasResult = document.querySelector('.alert-success, .alert, [class*="success"]');
      if (hasResult) {
        const t = (hasResult.innerText || hasResult.textContent || '').toLowerCase();
        if (t.includes('success') || t.includes('berhasil')) return { status: 'success' };
        if (t.includes('already') || t.includes('sudah')) return { status: 'already' };
      }
      // Kalau URL/body menunjukkan sukses tanpa alert spesifik
      if (bodyText.includes('successfully') || bodyText.includes('berhasil diinsert')) {
        return { status: 'success' };
      }
    }

    // Cek element result
    const selectors = ['.alert-success', '.alert-danger', '.alert', '[class*="success"]', '[class*="error"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const text = (el.innerText || el.textContent || '').trim();
      if (!text) continue;
      const t = text.toLowerCase();
      if (t.includes('success') || t.includes('berhasil')) return { status: 'success' };
      if (t.includes('already') || t.includes('sudah')) return { status: 'already' };
      return { status: 'error', msg: text.substring(0, 100) };
    }

    return { status: 'error', msg: 'Tidak bisa membaca hasil dari halaman' };
  } catch(e) {
    return { status: 'error', msg: e.message };
  }
}

// ══════════════════════════════════════════════════
//  EDIT INVEN (launcher inline)
// ══════════════════════════════════════════════════

function buildInvenUrl(domain, nick) {
  return `https://${domain}/index.php?do=admin_manage_edit_inventory&character_serial=&character_name=${encodeURIComponent(nick)}&search_fun=asu&old_ver=true`;
}

document.getElementById('inven-go-btn').addEventListener('click', () => {
  const nick = document.getElementById('inven-nick').value.trim();
  const domain = getDomain('launcher-domain');
  if (!nick) { document.getElementById('inven-nick').focus(); return; }
  chrome.tabs.create({ url: buildInvenUrl(domain, nick) });
});

document.getElementById('inven-nick').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('inven-go-btn').click();
});

// ══════════════════════════════════════════════════
//  BULK CHANGE RACE
// ══════════════════════════════════════════════════

// Nav
document.getElementById('goto-race').addEventListener('click', () => showView('view-race'));
document.getElementById('back-from-race').addEventListener('click', () => showView('view-launcher'));

// Sync domain
document.querySelectorAll('.inp-domain-field').forEach(el => {
  el.addEventListener('change', () => {
    const val = el.value.trim()
      .replace(/https?:\/\//g,'')
      .replace(/\.gamecp\.net.*/,'')
      .replace(/\s/g,'');
    el.value = val;
    // also sync race-domain
    const rd = document.getElementById('race-domain');
    if (rd && rd.value !== val) rd.value = val;
  });
});

// Batch quick-select
const raceBatchInput = document.getElementById('race-batch');
document.querySelectorAll('#race-batch-btns .batch-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#race-batch-btns .batch-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    raceBatchInput.value = btn.dataset.val;
  });
});
raceBatchInput.addEventListener('input', () => {
  const val = raceBatchInput.value;
  document.querySelectorAll('#race-batch-btns .batch-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === val);
  });
});

const raceBtnRun   = document.getElementById('race-btn-run');
const raceBtnStop  = document.getElementById('race-btn-stop');
const raceLogBox   = document.getElementById('race-log-box');
const raceProgWrap = document.getElementById('race-progress-wrap');
const raceProgFill = document.getElementById('race-progress-fill');
const raceProgText = document.getElementById('race-progress-text');

let raceRunning = false, raceStopFlag = false;
let raceActiveTabs = new Set();
let raceDone = 0, raceTotal = 0;

function setRaceProgress(current, total) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  raceProgFill.style.width = pct + '%';
  raceProgText.textContent = `${current} / ${total}`;
}

raceBtnStop.addEventListener('click', () => {
  raceStopFlag = true;
  log(raceLogBox, '⏹ Stop diminta...', 'err');
  raceActiveTabs.forEach(id => chrome.tabs.remove(id).catch(() => {}));
  raceActiveTabs.clear();
});

raceBtnRun.addEventListener('click', async () => {
  if (raceRunning) return;
  clearLog(raceLogBox);

  const names     = getNames('race-names');
  const newJob    = document.getElementById('race-new-job').value;
  const newJobTxt = document.getElementById('race-new-job').selectedOptions[0].text;
  const newGender = document.getElementById('race-new-gender').value;
  const oldEquip  = document.getElementById('race-old-equip').value;
  const newEquip  = document.getElementById('race-new-equip').value;
  const delayMs   = parseInt(document.getElementById('race-delay').value) * 1000;
  const batchSize = Math.max(1, Math.min(5, parseInt(raceBatchInput.value) || 1));
  const domain    = getDomain('race-domain');

  if (names.length === 0) { log(raceLogBox, 'Masukkan nickname dulu!', 'err'); return; }

  raceRunning = true; raceStopFlag = false; raceDone = 0; raceTotal = names.length;
  raceBtnRun.disabled = true; raceBtnStop.style.display = 'block'; raceProgWrap.style.display = 'block';
  setRaceProgress(0, raceTotal);

  const batches = [];
  for (let i = 0; i < names.length; i += batchSize) batches.push(names.slice(i, i + batchSize));
  log(raceLogBox, `Mulai ${raceTotal} player → Race: ${newJobTxt} | ${batches.length} batch x ${batchSize} paralel`, 'info');

  let successCount = 0, skipCount = 0, errorCount = 0;

  for (let b = 0; b < batches.length; b++) {
    if (raceStopFlag) break;
    const batch = batches[b];
    log(raceLogBox, `── Batch ${b+1}/${batches.length} [${batch.join(', ')}]`, 'info');

    const results = await Promise.allSettled(
      batch.map((nick, idx) => sleep(idx * 1000).then(() =>
        processRaceChange(nick, domain, newJob, newJobTxt, newGender, oldEquip, newEquip, delayMs)
      ))
    );

    results.forEach((r, idx) => {
      const nick = batch[idx];
      if (r.status === 'fulfilled') {
        const res = r.value;
        if (res.ok === true) {
          successCount++;
          log(raceLogBox, `  [OK] ${nick}: ${res.msg}`, 'ok');
        } else if (res.ok === 'skip') {
          skipCount++;
          log(raceLogBox, `  [SKIP] ${nick}: ${res.msg}`, 'warn');
        } else {
          errorCount++;
          log(raceLogBox, `  [GAGAL] ${nick}: ${res.msg}`, 'err');
        }
      } else {
        errorCount++;
        log(raceLogBox, `  [ERROR] ${nick}: ${r.reason?.message || 'error'}`, 'err');
      }
      raceDone++;
      setRaceProgress(raceDone, raceTotal);
    });

    if (b < batches.length - 1 && !raceStopFlag) await sleep(800);
  }

  raceRunning = false;
  raceBtnRun.disabled = false; raceBtnStop.style.display = 'none';
  log(raceLogBox, `${raceStopFlag ? 'Dihentikan' : 'Selesai'}! Berhasil: ${successCount}, Skip: ${skipCount}, Gagal: ${errorCount}`, successCount > 0 ? 'ok' : 'err');
});

async function processRaceChange(nick, domain, newJob, newJobTxt, newGender, oldEquip, newEquip, delayMs) {
  const url = `https://${domain}/index.php?do=admin_change_race_with_eq&character_serial=&character_name=${encodeURIComponent(nick)}`;
  let tabId = null;
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id; raceActiveTabs.add(tabId);
    await waitForRaceTabLoad(tabId);
    if (raceStopFlag) throw new Error('dihentikan');
    await sleep(800);

    // Search character
    const searchRes = await chrome.scripting.executeScript({
      target: { tabId },
      func: raceSearchAndCheck,
      args: [nick, newJobTxt, newGender]
    });
    const searchStatus = searchRes[0]?.result;
    if (!searchStatus) throw new Error('Tidak ada response dari halaman');
    if (searchStatus.status === 'not_found') return { ok: false, msg: 'Player tidak ditemukan' };
    if (searchStatus.status === 'same_race') return { ok: 'skip', msg: `sudah ${searchStatus.detail} — skip` };
    if (searchStatus.status === 'error') return { ok: false, msg: searchStatus.msg };

    // Fill the form
    const fillRes = await chrome.scripting.executeScript({
      target: { tabId },
      func: raceFillForm,
      args: [newJob, newGender, oldEquip, newEquip]
    });
    const fillStatus = fillRes[0]?.result;
    if (!fillStatus || fillStatus.status !== 'ok') {
      return { ok: false, msg: fillStatus?.msg || 'Gagal mengisi form' };
    }

    // Click submit (wait for CF)
    const clickRes = await chrome.scripting.executeScript({
      target: { tabId },
      func: raceClickSubmit,
      args: [delayMs]
    });
    const clickStatus = clickRes[0]?.result;
    if (!clickStatus || clickStatus.status !== 'clicked') {
      const keepId = tabId; tabId = null; raceActiveTabs.delete(keepId);
      return { ok: false, msg: `Gagal klik submit: ${clickStatus?.msg || 'unknown'} — tab dibiarkan terbuka` };
    }

    // Wait reload
    await waitForRaceReload(tabId, 25000);
    await sleep(400);

    // Read result
    const resultRes = await chrome.scripting.executeScript({
      target: { tabId },
      func: raceReadResult
    });
    const result = resultRes[0]?.result;
    if (result?.status === 'success') return { ok: true, msg: `${searchStatus.oldRace || '?'} → ${newJobTxt}` };
    return { ok: false, msg: result?.msg || 'Response tidak dikenali' };

  } finally {
    if (tabId) { await sleep(200); chrome.tabs.remove(tabId).catch(() => {}); raceActiveTabs.delete(tabId); }
  }
}

function waitForRaceTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Tab timeout')), 30000);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function waitForRaceReload(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Reload timeout')), timeoutMs);
    let phase = 'wait_loading';
    function listener(id, info) {
      if (id !== tabId) return;
      if (phase === 'wait_loading' && info.status === 'loading') { phase = 'wait_complete'; return; }
      if (phase === 'wait_complete' && info.status === 'complete') {
        clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(async () => {
      if (phase === 'wait_loading') {
        try {
          const check = await chrome.scripting.executeScript({ target: { tabId }, func: () => document.readyState });
          if (check[0]?.result === 'complete') { clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve(); }
        } catch(_) {}
      }
    }, 3000);
  });
}

// Runs inside page: check if character was found, read old race, compare with target
// newJobTxt = e.g. "Bellato - Warrior", targetGender = "0" (Male) or "1" (Female)
function raceSearchAndCheck(nick, newJobTxt, targetGender) {
  try {
    // ── 1. Detect character not found ─────────────────────────────────────
    const newJobSel = document.querySelector("select[name='new_job']");
    if (!newJobSel) {
      const bodyText = (document.body.innerText || '').toLowerCase();
      if (bodyText.includes('not found') || bodyText.includes('tidak ditemukan')) {
        return { status: 'not_found' };
      }
      return { status: 'not_found' };
    }

    // ── 2. Read Old Race Job from <th> element ─────────────────────────────
    // Element: <th><font color="...">Bellato Male</font> - (BWB0) Warrior</th>
    const oldRaceTh = document.querySelector(
      "#rzr > div > div > div > div > form:nth-child(9) > table > tbody > tr:nth-child(3) > th:nth-child(2)"
    );
    const oldRaceRaw = oldRaceTh ? (oldRaceTh.innerText || oldRaceTh.textContent || '').trim() : '';

    // ── 3. Parse race & job from old race string ───────────────────────────
    // Format examples:
    //   "Bellato Male - (BWB0) Warrior"
    //   "Cora Male - (CWB0) Warrior"
    //   "Accretia - (ASB0) Specialist"
    // We extract: race (Bellato/Cora/Accretia), job (Warrior/Ranger/Spiritualist/Specialist)
    // and gender (Male/Female — absent for Accretia)
    const raceMatch  = oldRaceRaw.match(/^(Bellato|Cora|Accretia)/i);
    const jobMatch   = oldRaceRaw.match(/\b(Warrior|Ranger|Spiritualist|Specialist|Force|Launcher)\b/i);
    const genderMatch = oldRaceRaw.match(/\b(Male|Female)\b/i);

    const oldRaceName  = raceMatch  ? raceMatch[1].charAt(0).toUpperCase() + raceMatch[1].slice(1).toLowerCase() : '';
    const oldJobName   = jobMatch   ? jobMatch[1].charAt(0).toUpperCase() + jobMatch[1].slice(1).toLowerCase()   : '';
    const oldGenderName = genderMatch ? genderMatch[1] : 'Male'; // Accretia has no gender display, default Male

    // ── 4. Parse target race & job from newJobTxt ─────────────────────────
    // newJobTxt format: "Bellato - Warrior", "Cora - Specialist", "Accretia - Ranger"
    const tgtRaceMatch = newJobTxt.match(/^(Bellato|Cora|Accretia)/i);
    const tgtJobMatch  = newJobTxt.match(/- (.+)$/);
    const tgtRaceName  = tgtRaceMatch ? tgtRaceMatch[1].charAt(0).toUpperCase() + tgtRaceMatch[1].slice(1).toLowerCase() : '';
    const tgtJobName   = tgtJobMatch  ? tgtJobMatch[1].trim() : '';
    const tgtGenderName = targetGender === '1' ? 'Female' : 'Male';

    // ── 5. Compare ─────────────────────────────────────────────────────────
    const sameRace   = oldRaceName.toLowerCase()   === tgtRaceName.toLowerCase();
    const sameJob    = oldJobName.toLowerCase()    === tgtJobName.toLowerCase();
    const sameGender = oldGenderName.toLowerCase() === tgtGenderName.toLowerCase();

    if (sameRace && sameJob && sameGender) {
      return {
        status: 'same_race',
        oldRace: oldRaceRaw,
        detail: `${oldRaceName} ${oldGenderName} - ${oldJobName}`
      };
    }

    return { status: 'ok', oldRace: oldRaceRaw };
  } catch(e) {
    return { status: 'error', msg: e.message };
  }
}

// Runs inside page: fill the race change form
function raceFillForm(newJob, newGender, oldEquip, newEquip) {
  try {
    const newJobSel    = document.querySelector("#rzr > div > div > div > div > form:nth-child(9) > table > tbody > tr:nth-child(4) > td > select");
    const newGenderSel = document.querySelector("#rzr > div > div > div > div > form:nth-child(9) > table > tbody > tr:nth-child(5) > td > select");
    const oldEquipSel  = document.querySelector("#rzr > div > div > div > div > form:nth-child(9) > table > tbody > tr:nth-child(6) > td > select");
    const newEquipSel  = document.querySelector("#rzr > div > div > div > div > form:nth-child(9) > table > tbody > tr:nth-child(7) > td > select");

    // Fallback selectors
    const jobSel    = newJobSel    || document.querySelector("select[name='new_job']");
    const genderSel = newGenderSel || document.querySelector("select[name='new_gender']");
    const oldEqSel  = oldEquipSel  || document.querySelector("select[name='old_equip']");
    const newEqSel  = newEquipSel  || document.querySelector("select[name='new_equip']");

    if (!jobSel) return { status: 'error', msg: 'Form tidak ditemukan (new_job missing)' };

    if (jobSel)    { jobSel.value    = newJob;    jobSel.dispatchEvent(new Event('change', {bubbles:true})); }
    if (genderSel) { genderSel.value = newGender; genderSel.dispatchEvent(new Event('change', {bubbles:true})); }
    if (oldEqSel)  { oldEqSel.value  = oldEquip;  oldEqSel.dispatchEvent(new Event('change', {bubbles:true})); }
    if (newEqSel)  { newEqSel.value  = newEquip;  newEqSel.dispatchEvent(new Event('change', {bubbles:true})); }

    return { status: 'ok' };
  } catch(e) {
    return { status: 'error', msg: e.message };
  }
}

// Runs inside page: wait for CF then click submit
function raceClickSubmit(maxWaitMs) {
  return new Promise((resolve) => {
    const MAX_TRIES = Math.ceil(maxWaitMs / 500);
    const btn = document.querySelector('#ok-gas');
    if (!btn) return resolve({ status: 'error', msg: 'Tombol #ok-gas tidak ditemukan' });
    if (!btn.disabled) { btn.click(); return resolve({ status: 'clicked' }); }
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      const b = document.querySelector('#ok-gas');
      if (b && !b.disabled) {
        clearInterval(iv); b.click(); resolve({ status: 'clicked' });
      } else if (tries >= MAX_TRIES) {
        clearInterval(iv);
        resolve({ status: 'error', msg: `Tombol masih disabled setelah ${maxWaitMs/1000}s (Cloudflare belum selesai?)` });
      }
    }, 500);
  });
}

// Runs inside page: read result after form submit
function raceReadResult() {
  try {
    const bodyText = (document.body.innerText || '').toLowerCase();
    const selectors = ['.alert-success', '.alert-danger', '.alert', '[class*="success"]', '[class*="error"]', '[class*="alert"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const text = (el.innerText || el.textContent || '').trim();
      if (!text) continue;
      const t = text.toLowerCase();
      if (t.includes('success') || t.includes('berhasil') || t.includes('changed')) return { status: 'success' };
      if (t.includes('failed') || t.includes('error') || t.includes('gagal')) return { status: 'error', msg: text.substring(0, 120) };
      return { status: 'error', msg: text.substring(0, 120) };
    }
    if (bodyText.includes('success') || bodyText.includes('berhasil') || bodyText.includes('race changed')) {
      return { status: 'success' };
    }
    return { status: 'error', msg: 'Tidak bisa membaca hasil dari halaman' };
  } catch(e) {
    return { status: 'error', msg: e.message };
  }
}

// ══════════════════════════════════════════════════
//  VERSION CHECK & AUTO UPDATE NOTIFIER
// ══════════════════════════════════════════════════

const GH_MANIFEST_URL  = 'https://raw.githubusercontent.com/erzaDuckie/gcp-tools/main/manifest.json';
const GH_DOWNLOAD_URL  = 'https://github.com/erzaDuckie/gcp-tools/releases/latest/download/GCP_TOOLS_latest.zip';
const LOCAL_VERSION    = '3.0.2';

// Semaphore version comparison: "3.0a" < "3.1" < "3.1b" < "4.0"
function parseVer(v) {
  // Split "3.0a" → { nums: [3, 0], suffix: 'a' }
  const m = String(v).trim().match(/^(\d+(?:\.\d+)*)([a-z]*)$/i);
  if (!m) return { nums: [0], suffix: '' };
  return {
    nums: m[1].split('.').map(Number),
    suffix: (m[2] || '').toLowerCase()
  };
}

function isNewer(remote, local) {
  const r = parseVer(remote);
  const l = parseVer(local);
  const len = Math.max(r.nums.length, l.nums.length);
  for (let i = 0; i < len; i++) {
    const rn = r.nums[i] || 0;
    const ln = l.nums[i] || 0;
    if (rn > ln) return true;
    if (rn < ln) return false;
  }
  // same numbers, compare suffix: '' (no suffix) is RELEASE > alpha/beta suffix
  // 'a','b' etc treated as pre-release? Here we treat suffix as newer if remote has suffix and local doesn't,
  // but if local has no suffix and remote has suffix on SAME base → remote is newer patch
  if (r.suffix && !l.suffix) return true;
  if (!r.suffix && l.suffix) return false;
  return r.suffix > l.suffix;
}

async function checkForUpdate() {
  const checking  = document.getElementById('update-checking');
  const upToDate  = document.getElementById('update-uptodate');
  const banner    = document.getElementById('update-banner');
  const newVerEl  = document.getElementById('update-new-ver');
  const dlBtn     = document.getElementById('update-banner-btn');

  checking.classList.add('visible');

  try {
    const res  = await fetch(GH_MANIFEST_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const remoteVer = data.version || '0';

    checking.classList.remove('visible');

    if (isNewer(remoteVer, LOCAL_VERSION)) {
      // Update tersedia!
      newVerEl.textContent = `(v${LOCAL_VERSION} → v${remoteVer})`;
      banner.classList.add('visible');

      dlBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: GH_DOWNLOAD_URL });
      });
    } else {
      upToDate.classList.add('visible');
      setTimeout(() => upToDate.classList.remove('visible'), 3000);
    }
  } catch (e) {
    checking.classList.remove('visible');
    // Gagal cek versi — silent, tidak ganggu user
    console.warn('[GCP TOOLS] Gagal cek update:', e.message);
  }
}

// Jalankan version check saat popup dibuka
checkForUpdate();
