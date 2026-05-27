// content_give.js — RF Give Item Helper v2.9 by ERZA
// Jalan di: Give Item (single char) DAN Give Item Multi Chars

(function() {

const params = new URLSearchParams(window.location.search);
const doParam = params.get("do");

const IS_SINGLE = doParam === "admin_manage_give_item_std";
const IS_MULTI  = doParam === "admin_manage_give_item_mulchars";

if (!IS_SINGLE && !IS_MULTI) return;

function dbg(...args) { console.log("[RF-GIVE]", ...args); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── TUNGGU ELEMEN ────────────────────────────────────────────────
function waitFor(selectorFn, timeout = 10000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const el = selectorFn();
      if (el) { resolve(el); return; }
      if (Date.now() - start > timeout) { resolve(null); return; }
      setTimeout(check, 150);
    };
    check();
  });
}

const waitForFirstRow  = (t) => waitFor(() => {
  const row = document.querySelector("#row0");
  const inp = row ? (row.querySelector("input.item_code_ajax") || row.querySelector("input[name='item_code[]']")) : null;
  return (row && inp) ? true : null;
}, t);

// Single: <button class="btn btn-success"> | Multi mode=0: input#last td input | Multi mode=1: input#myTable2 tbody input
function findSearchBtn() {
  if (IS_SINGLE) return document.querySelector("button.btn.btn-success");
  // mode=0: selector dari #last row
  const m0 = document.querySelector("#last > td:nth-child(2) > input[name='gas']");
  if (m0) return m0;
  // mode=1: selector dari #myTable2
  const m1 = document.querySelector("#myTable2 > tbody > tr:nth-child(2) > td > input[name='gas']");
  if (m1) return m1;
  // fallback: input[type=submit].btn-success
  return document.querySelector("input[type='submit'].btn-success[name='gas']");
}
const waitForSearchBtn = (t) => waitFor(() => findSearchBtn(), t);

// ─── KOMUNIKASI KE MAIN WORLD ────────────────────────────────────
function pageInitAndFill(itemsData) {
  document.dispatchEvent(new CustomEvent("__rfGiveInitAndFill", {
    detail: { items: itemsData }
  }));
}

// ─── BUILD ROW HTML ───────────────────────────────────────────────
function buildRowHTML(idx) {
  return "<tr id=\'row" + idx + "\'>" +
    "<td style=\'text-align: center;\' nowrap>" + idx + "</td>" +
    "<td nowrap><input type=\'hidden\' size=\'5\' name=\'item_code[]\' class=\'item_code_ajax\' id=\'item_code" + idx + "\'/></td>" +
    "<td style=\'text-align: center;\' nowrap><input class=\'form-control\' style=\'text-align:center;\' type=\'text\' name=\'item_amount[]\' value=\'0\'></td>" +
    "<td nowrap>" +
      "<select class=\'form-control\' style=\'text-align:center;min-width: 0;width: auto;display: inline;\' name=\'item_ups[]\'>" +
        "<option value=\'0\'>+0</option><option value=\'1\'>+1</option><option value=\'2\'>+2</option>" +
        "<option value=\'3\'>+3</option><option value=\'4\'>+4</option><option value=\'5\'>+5</option>" +
        "<option value=\'6\'>+6</option><option value=\'7\'>+7</option>" +
      "</select> / " +
      "<select class=\'form-control\' style=\'text-align:center;min-width: 0;width: auto;display: inline;\' name=\'item_slots[]\'>" +
        "<option value=\'0\'>0</option><option value=\'1\'>1</option><option value=\'2\'>2</option>" +
        "<option value=\'3\'>3</option><option value=\'4\'>4</option><option value=\'5\'>5</option>" +
        "<option value=\'6\'>6</option><option value=\'7\'>7</option>" +
      "</select> " +
      "<select class=\'form-control\' style=\'text-align:center;min-width: 0;width: auto;display: inline;\' name=\'item_talic[]\'>" +
        "<option value=\'1\'>No Talic</option><option value=\'2\'>Rebirth</option><option value=\'3\'>Mercy</option>" +
        "<option value=\'4\'>Grace</option><option value=\'5\'>Glory</option><option value=\'6\'>Guard</option>" +
        "<option value=\'7\'>Belief</option><option value=\'8\'>Sacred Flame</option><option value=\'9\'>Wisdom</option>" +
        "<option value=\'10\'>Favor</option><option value=\'11\'>Hatred</option><option value=\'12\'>Chaos</option>" +
        "<option value=\'13\'>Darkness</option><option value=\'14\'>Destruction</option><option value=\'15\'>Ignorant</option>" +
      "</select>" +
    "</td>" +
    "<td nowrap><input class=\'form-control\' style=\'text-align:center;\' type=\'text\' name=\'item_rental_time[]\' value=\'0\'/></td>" +
    "<td style=\'text-align: right;\' nowrap><a href=\'#\' onClick=\'removeFormField(&quot;#row" + idx + "&quot;); return false;\'>Remove</a></td>" +
  "</tr>";
}

// ─── PREPARE ROWS ────────────────────────────────────────────────
// !! JANGAN DIUBAH !! — Urutan ini SUDAH BENAR dan SESUAI perilaku halaman GCP.
//
// PENJELASAN URUTAN VISUAL HALAMAN:
//   Halaman admin_manage_give_item_std menampilkan row dari atas ke bawah
//   dengan urutan: row(N-1) di paling ATAS, row0 di paling BAWAH.
//   Contoh 5 item: tampil sebagai [4, 3, 2, 1, 0] dari atas ke bawah.
//   Ini adalah behavior DEFAULT halaman GCP — BUKAN bug.
//
// CARA KERJA prepareRows:
//   Row baru disisipkan tepat sebelum row0 (insertAdjacentHTML "beforebegin"),
//   dengan loop dari index BESAR ke KECIL.
//   Contoh tambah row1,row2,row3,row4 ke halaman yang sudah ada row0:
//     - Insert row4 before row0 → DOM: [row4, row0]
//     - Insert row3 before row0 → DOM: [row4, row3, row0]
//     - Insert row2 before row0 → DOM: [row4, row3, row2, row0]
//     - Insert row1 before row0 → DOM: [row4, row3, row2, row1, row0] ✅
//
// !! JANGAN ubah loop jadi ascending (kecil→besar) — urutan akan terbalik jadi [1,2,3,4,0] !!
// !! JANGAN ganti insertAdjacentHTML dengan cara lain !!
function prepareRows(needed) {
  const row0 = document.querySelector("#row0");
  if (!row0) { dbg("prepareRows: row0 not found"); return 0; }

  const allRows = () => document.querySelectorAll("tr[id^='row']");

  // Hapus kelebihan dari index terbesar
  while (allRows().length > needed) {
    const rows = allRows();
    let maxIdx = -1, maxRow = null;
    rows.forEach(r => {
      const idx = parseInt(r.id.replace("row", ""), 10);
      if (!isNaN(idx) && idx > maxIdx) { maxIdx = idx; maxRow = r; }
    });
    if (maxRow) maxRow.remove(); else break;
  }

  // Tambah kekurangan — loop dari index BESAR ke KECIL, insert sebelum row0.
  // Hasil akhir DOM atas→bawah: [row(needed-1), ..., row1, row0]. ✅
  const current = allRows().length;
  for (let i = needed - 1; i >= current; i--) {
    row0.insertAdjacentHTML("beforebegin", buildRowHTML(i));
  }

  const idEl = document.getElementById("id");
  if (idEl) idEl.value = String(needed);

  const total = allRows().length;
  dbg("prepareRows: " + current + " → " + total + " (needed " + needed + ")");
  return total;
}

// ─── ENSURE ROWS (alias) ─────────────────────────────────────────
function ensureRows(needed) { return prepareRows(needed); }

// ─── FILL FORM ────────────────────────────────────────────────────
// characterName hanya relevan untuk IS_SINGLE; di IS_MULTI dikosongkan.
async function fillGiveItemForm(items, characterName) {
  dbg("fillGiveItemForm:", items.length, "items | char:", characterName || "(multi mode)");
  updateInlineBtn("filling");

  // Isi character name hanya di halaman single DAN hanya kalau field di halaman masih kosong.
  // Jika user sudah ketik/search nick sendiri di halaman, jangan di-override.
  if (IS_SINGLE && characterName) {
    const charInput = document.querySelector("input[name='character_name']") ||
                      document.querySelector("#character_name");
    if (charInput && !charInput.value.trim()) {
      // Field kosong → isi dari storage (flow: FILL dari popup sebelum Search)
      charInput.value = characterName;
      charInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    // Jika charInput.value sudah ada (user sudah Search nick lain) → biarkan, jangan override
  }

  const N = items.length;
  ensureRows(N);  // prepareRows: hapus kelebihan/tambah kekurangan, pakai row existing

  const s2Items = [];
  for (let i = 0; i < N; i++) {
    const item   = items[i];
    // !! JANGAN DIUBAH !! — Mapping ini SUDAH BENAR.
    //
    // PENJELASAN:
    //   Halaman GCP menampilkan row(N-1) di ATAS dan row0 di BAWAH.
    //   Maka item[0] (pertama dari list popup) harus mengisi row(N-1) = baris TERATAS,
    //   dan item[N-1] (terakhir) mengisi row0 = baris TERBAWAH.
    //   Formula: rowIdx = (N-1) - i  → ini BENAR, BUKAN bug.
    //
    // !! JANGAN dibalik jadi rowIdx = i — itu SALAH dan akan membuat urutan terbalik !!
    const rowIdx = (N - 1) - i;
    const row    = document.querySelector("#row" + rowIdx);
    if (!row) { dbg("row" + rowIdx + " missing!"); continue; }

    const codeInput = row.querySelector("input[name='item_code[]']") ||
                      row.querySelector("input.item_code_ajax");
    if (codeInput) {
      codeInput.value = item.code;
      s2Items.push({
        inputId: codeInput.id || ("item_code" + rowIdx),
        code: item.code,
        name: item.name || item.code
      });
    }

    const amtInput  = row.querySelector("input[name='item_amount[]']");
    const upgSel    = row.querySelector("select[name='item_ups[]']");
    const slotsSel  = row.querySelector("select[name='item_slots[]']");
    const talicSel  = row.querySelector("select[name='item_talic[]']");
    if (amtInput)  amtInput.value  = item.qty     || 1;
    if (upgSel)    upgSel.value    = String(item.upgrade || 0);
    if (slotsSel)  slotsSel.value  = String(item.slots   || 0);
    if (talicSel)  talicSel.value  = String(item.talic   || 1);
    dbg("Fill row" + rowIdx + ": " + item.code);
  }

  pageInitAndFill(s2Items);
  showToast("✅ " + items.length + " item(s) filled!");
  updateInlineBtn("done");
}

// ─── TOAST ───────────────────────────────────────────────────────
function showToast(message, isErr) {
  const existing = document.getElementById("erza-give-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "erza-give-toast";
  toast.textContent = message;
  toast.style.cssText =
    "position:fixed;bottom:24px;right:24px;" +
    "background:" + (isErr ? "linear-gradient(135deg,#6b1a1a,#4a0e0e)" : "linear-gradient(135deg,#1a6b3c,#0e4227)") + ";" +
    "color:" + (isErr ? "#ff9e9e" : "#6bff9e") + ";" +
    "padding:12px 20px;border-radius:8px;" +
    "font-family:'Segoe UI',sans-serif;font-size:13px;font-weight:600;" +
    "z-index:99999;box-shadow:0 4px 15px rgba(0,0,0,0.5);" +
    "border:1px solid " + (isErr ? "#e74c3c" : "#2ecc71") + ";";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ─── INLINE BUTTON STATE ─────────────────────────────────────────
function updateInlineBtn(state) {
  const btn = document.getElementById("erza-fill-inline");
  if (!btn) return;
  if (state === "filling") {
    btn.innerHTML = "⏳ Filling...";
    btn.style.opacity = "0.7";
    btn.style.backgroundColor = "#2980b9";
    btn.style.borderColor = "#1a5276";
    btn.disabled = true;
  } else if (state === "done") {
    btn.innerHTML = "✅ Filled! (retry)";
    btn.style.opacity = "1";
    btn.style.backgroundColor = "#27ae60";
    btn.style.borderColor = "#1a6b3c";
    btn.disabled = false;
  } else {
    btn.innerHTML = "⚡ Fill Items";
    btn.style.opacity = "1";
    btn.style.backgroundColor = "";
    btn.style.borderColor = "";
    btn.disabled = false;
  }
}

// ─── INJECT INLINE BUTTON ────────────────────────────────────────
// Selalu inject saat halaman dibuka, apapun sumbernya.
// Di halaman MULTI: cari Search button yang ada di area form (bukan di atas char list).
// Di halaman SINGLE: Search button ada di area char lookup.
async function injectInlineButton() {
  if (document.getElementById("erza-fill-inline")) return;

  // Untuk mulchars, ada 2 Search button (satu di char area, satu mungkin tidak ada).
  // Kita pakai yang TERAKHIR di DOM — yang dekat dengan form item.
  // Untuk single, hanya ada satu Search button.
  const searchBtn = await waitForSearchBtn(10000);
  if (!searchBtn) {
    dbg("Search button tidak ditemukan.");
    return;
  }

  // targetBtn sudah hasil findSearchBtn() — spesifik per mode
  let targetBtn = searchBtn;

  const fillBtn = document.createElement("button");
  fillBtn.id        = "erza-fill-inline";
  fillBtn.type      = "button";
  fillBtn.className = targetBtn.className;
  fillBtn.innerHTML = "⚡ Fill Items";
  fillBtn.style.marginLeft = "8px";

  fillBtn.addEventListener("click", async () => {
    if (fillBtn.disabled) return;
    fillBtn.disabled = true;

    chrome.storage.local.get(
      ["rf_loaded_items", "rf_loaded_selected", "rf_bank_items", "rf_give_char_name"],
      async (res) => {
        let items    = [];
        let selected = null;

        if (res.rf_loaded_items && res.rf_loaded_items.length > 0) {
          items    = res.rf_loaded_items;
          selected = new Set(res.rf_loaded_selected || items.map(i => i.id));
        } else if (res.rf_bank_items && res.rf_bank_items.length > 0) {
          items    = res.rf_bank_items;
          selected = new Set(items.map(i => i.id));
        }

        if (!items.length) {
          showToast("⚠️ Tidak ada item di storage. Scan bank atau load preset dulu.", true);
          updateInlineBtn("idle");
          fillBtn.disabled = false;
          return;
        }

        const toFill = selected ? items.filter(i => selected.has(i.id)) : items;
        if (!toFill.length) {
          showToast("⚠️ Tidak ada item yang dipilih.", true);
          updateInlineBtn("idle");
          fillBtn.disabled = false;
          return;
        }

        // Prioritaskan nick yang sudah ada di halaman (user mungkin sudah Search nick lain)
        const _pageCharInput = document.querySelector("input[name='character_name']") ||
                               document.querySelector("#character_name");
        const _pageCharName  = _pageCharInput ? _pageCharInput.value.trim() : '';
        const charName = IS_SINGLE ? (_pageCharName || res.rf_give_char_name || "") : "";

        const ready = await waitForFirstRow(8000);
        if (!ready) {
          showToast("⚠️ Form belum siap. Klik Search dulu lalu Fill.", true);
          updateInlineBtn("idle");
          fillBtn.disabled = false;
          return;
        }
        let s2wait = 0;
        while (typeof $select2_options === "undefined" && s2wait < 30) {
          await sleep(100); s2wait++;
        }

        try {
          await fillGiveItemForm(toFill, charName);
        } catch(e) {
          dbg("Fill error:", e);
          showToast("❌ Error: " + e.message, true);
          updateInlineBtn("idle");
        }
        fillBtn.disabled = false;
      }
    );
  });

  targetBtn.parentNode.insertBefore(fillBtn, targetBtn.nextSibling);
  dbg("Inline Fill button injected (" + (IS_MULTI ? "multi" : "single") + " mode) ✅");
}


// ─── INJECT PRESET SHORTCUT BUTTONS ─────────────────────────────
// Tampilkan max 3 preset teratas dari storage sebagai shortcut button
// di sebelah kanan Fill Items button
async function injectPresetShortcuts() {
  if (document.getElementById('erza-preset-bar')) return;

  const fillBtn = await waitFor(() => document.getElementById('erza-fill-inline'), 5000);
  if (!fillBtn) { dbg('Fill button belum ada, skip preset shortcuts'); return; }

  chrome.storage.local.get(['rf_presets'], (res) => {
    const presets = (res.rf_presets || []).slice(0, 3);
    if (!presets.length) return;

    const bar = document.createElement('span');
    bar.id = 'erza-preset-bar';
    bar.style.cssText = 'display:inline-flex;gap:5px;margin-left:8px;vertical-align:middle;';

    presets.forEach((preset, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = preset.name + ' (' + preset.items.length + ' item)';
      btn.innerHTML = '📌' + (idx + 1) + ' ' + preset.name.substring(0, 10) + (preset.name.length > 10 ? '…' : '');
      btn.style.cssText =
        'padding:4px 9px;font-size:11px;font-weight:600;border-radius:4px;cursor:pointer;' +
        'background:linear-gradient(135deg,#3a3f8a,#23275e);color:#b8bfff;' +
        'border:1px solid #5865f2;transition:all 0.15s;white-space:nowrap;';
      btn.addEventListener('mouseenter', () => { btn.style.background = 'linear-gradient(135deg,#5865f2,#3a3f8a)'; btn.style.color = '#fff'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'linear-gradient(135deg,#3a3f8a,#23275e)'; btn.style.color = '#b8bfff'; });

      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.innerHTML = '⏳ Loading...';

        const ready = await waitForFirstRow(8000);
        if (!ready) {
          showToast('⚠️ Form belum siap. Klik Search dulu.', true);
          btn.disabled = false;
          btn.innerHTML = '📌' + (idx + 1) + ' ' + preset.name.substring(0, 10) + (preset.name.length > 10 ? '…' : '');
          return;
        }

        let s2wait = 0;
        while (typeof $select2_options === 'undefined' && s2wait < 30) {
          await sleep(100); s2wait++;
        }

        try {
          chrome.storage.local.get(['rf_give_char_name'], async (r) => {
            // Baca nick dari halaman dulu — jangan override kalau user sudah Search nick lain
            const pageCharInput = document.querySelector("input[name='character_name']") ||
                                  document.querySelector("#character_name");
            const pageCharName  = pageCharInput ? pageCharInput.value.trim() : '';
            const charName = IS_SINGLE ? (pageCharName || r.rf_give_char_name || '') : '';
            await fillGiveItemForm(preset.items, charName);
            btn.disabled = false;
            btn.innerHTML = '✅ ' + preset.name.substring(0, 10) + (preset.name.length > 10 ? '…' : '');
            setTimeout(() => {
              btn.innerHTML = '📌' + (idx + 1) + ' ' + preset.name.substring(0, 10) + (preset.name.length > 10 ? '…' : '');
            }, 2000);
          });
        } catch(e) {
          showToast('❌ ' + e.message, true);
          btn.disabled = false;
          btn.innerHTML = '📌' + (idx + 1) + ' ' + preset.name.substring(0, 10) + (preset.name.length > 10 ? '…' : '');
        }
      });

      bar.appendChild(btn);
    });

    fillBtn.parentNode.insertBefore(bar, fillBtn.nextSibling);
    dbg('Preset shortcuts injected: ' + presets.length + ' preset(s)');
  });
}

// ─── MESSAGE LISTENER ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "fill_give_item") {
    dbg("Message received:", msg.items.length, "items");
    fillGiveItemForm(msg.items, msg.characterName)
      .then(() => sendResponse({ ok: true }))
      .catch(e => { showToast("❌ " + e.message, true); sendResponse({ ok: false }); });
    return true;
  }
});

// ─── INIT ─────────────────────────────────────────────────────────
(async function init() {
  dbg("content_give.js v2.9 loaded | mode:", IS_MULTI ? "MULTI" : "SINGLE");

  // 1. Inject button selalu
  injectInlineButton();

  // 2. Inject preset shortcut buttons (top 3 dari storage)
  injectPresetShortcuts();

  // 3. Cek pending fill (dari klik FILL di popup extension) — hanya relevan untuk SINGLE
  if (IS_SINGLE) {
    chrome.storage.local.get(["rf_pending_fill"], async (res) => {
      const pending = res.rf_pending_fill;
      if (!pending) { dbg("No pending fill."); return; }
      if (Date.now() - pending.ts > 60000) {
        dbg("Pending fill expired.");
        chrome.storage.local.remove(["rf_pending_fill"]);
        return;
      }

      dbg("Pending fill:", pending.items.length, "items — auto-filling...");
      chrome.storage.local.remove(["rf_pending_fill"]);

      const ready = await waitForFirstRow(10000);
      if (!ready) { showToast("⚠️ Form timeout. Klik ⚡ Fill Items.", true); return; }

      let s2wait = 0;
      while (typeof $select2_options === "undefined" && s2wait < 30) {
        await sleep(100); s2wait++;
      }

      try {
        await fillGiveItemForm(pending.items, pending.characterName);
      } catch(e) {
        showToast("❌ " + e.message, true);
      }
    });
  }
})();

})(); // end IIFE