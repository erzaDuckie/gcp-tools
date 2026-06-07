// Only run on Bank Remove page
if (new URLSearchParams(window.location.search).get("do") === "admin_manage_delete_bank") {

// content_bank.js - Scans Bank Remove page and stores items to chrome.storage

const TALIC_MAP = {
  "t-00.png": { name: "Ignorant",     value: 15 },
  "t-01.png": { name: "Destruction",  value: 14 },
  "t-02.png": { name: "Darkness",     value: 13 },
  "t-03.png": { name: "Chaos",        value: 12 },
  "t-04.png": { name: "Hatred",       value: 11 },
  "t-05.png": { name: "Favor",        value: 10 },
  "t-06.png": { name: "Wisdom",       value: 9  },
  "t-07.png": { name: "Sacred Flame", value: 8  },
  "t-08.png": { name: "Belief",       value: 7  },
  "t-09.png": { name: "Guard",        value: 6  },
  "t-10.png": { name: "Glory",        value: 5  },
  "t-11.png": { name: "Grace",        value: 4  },
  "t-12.png": { name: "Mercy",        value: 3  },
  "t-13.png": { name: "Restoration",  value: 2  },
  "t-15.png": { name: "No Talic",     value: 1  }
};

function getTalicInfo(tdEl) {
  const divs = tdEl.querySelectorAll("div");
  for (const div of divs) {
    const imgs = div.querySelectorAll("img");
    if (!imgs.length) continue;
    if (!imgs[0].src.includes("/talics/")) continue;
    const slots = imgs.length;
    for (const img of imgs) {
      const match = img.src.match(/t-(\d+)\.png/);
      if (!match) continue;
      const key = `t-${match[1]}.png`;
      if (key === "t-15.png") continue;
      if (TALIC_MAP[key]) return { ...TALIC_MAP[key], slots };
    }
    return { name: "No Talic", value: 1, slots };
  }
  return { name: "No Talic", value: 1, slots: 0 };
}

function decodeUpgrade(dataUpg) {
  const val = parseInt(dataUpg) >>> 0;
  const upg = (val >>> 28) & 0x7;
  if (val === 0x0FFFFFFF || val === 0x7FFFFFFF || val === 0xFFFFFFFF) return 0;
  return upg;
}

function scanBankItems() {
  const items = [];
  const allRows = document.querySelectorAll("#porm tr");

  allRows.forEach((row, idx) => {
    if (row.querySelector("th.success")) return;

    const tds = row.querySelectorAll("td");
    if (tds.length < 3) return;

    const itemTd = tds[2];
    if (!itemTd) return;

    const innerTds = itemTd.querySelectorAll("table td");
    if (innerTds.length < 2) return;

    const infoTd = innerTds[1];

    let itemCode = "";
    let itemName = "";
    const boldEls = infoTd.querySelectorAll("b");
    for (const b of boldEls) {
      const txt = b.textContent.trim();
      if (txt.startsWith("(") && txt.endsWith(")")) {
        itemCode = txt.slice(1, -1);
      }
    }
    const nameEl = infoTd.querySelector("a span b, a.tooltipx span b, a.rzr_id span b");
    if (nameEl) itemName = nameEl.textContent.trim();

    if (!itemCode) return;

    const serialLink = row.querySelector("a[href*='item_ser=']");
    const serial = serialLink ? serialLink.textContent.trim() : `${itemCode}_${idx}`;

    let qty = 1;
    for (const d of infoTd.querySelectorAll("div")) {
      const txt = d.textContent.trim();
      let m = txt.match(/^Quantity\s*:\s*([\d,]+)$/);
      if (m) { qty = parseInt(m[1].replace(/,/g, "")); break; }
      m = txt.match(/^Durability\s*:\s*([\d,]+)$/);
      if (m) { qty = parseInt(m[1].replace(/,/g, "")); break; }
      m = txt.match(/^Ammo\s*:\s*([\d,]+)$/);
      if (m) { qty = parseInt(m[1].replace(/,/g, "")); break; }
    }

    const talic = getTalicInfo(infoTd);
    const anchor = infoTd.querySelector("a[data-upg]");
    const upgrade = anchor ? decodeUpgrade(anchor.getAttribute("data-upg")) : 0;

    items.push({
      id: `item_${items.length}`,
      code: itemCode,
      name: itemName || itemCode,
      qty,
      upgrade,
      slots: talic.slots,
      talic: talic.value,
      talicName: talic.name,
      serial
    });
  });

  return items;
}

// ── Helper: cek apakah extension context masih valid ──
function isContextValid() {
  try {
    return !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

function showStatus(statusDiv, text, color, duration = 3000) {
  statusDiv.textContent = text;
  statusDiv.style.color = color;
  statusDiv.style.display = "block";
  setTimeout(() => { statusDiv.style.display = "none"; }, duration);
}

function injectScanButton() {
  if (document.getElementById("erza-bank-scanner")) return;

  const searchBtn = document.querySelector("button.btn.btn-success");
  if (!searchBtn) {
    setTimeout(injectScanButton, 500);
    return;
  }

  const statusDiv = document.createElement("div");
  statusDiv.id = "erza-scan-status";
  statusDiv.style.cssText =
    "position:fixed;bottom:24px;right:24px;z-index:99999;" +
    "background:#1a1a2e;color:#e0e0e0;padding:6px 12px;" +
    "border-radius:6px;font-size:12px;display:none;border:1px solid #444;";
  document.body.appendChild(statusDiv);

  const scanBtn = document.createElement("button");
  scanBtn.id = "erza-bank-scanner";
  scanBtn.type = "button";
  scanBtn.className = searchBtn.className;
  scanBtn.innerHTML = 'Copy Bank Items';
  scanBtn.style.marginLeft = "8px";
  searchBtn.parentNode.insertBefore(scanBtn, searchBtn.nextSibling);

  scanBtn.addEventListener("click", () => {
    // ── Cek context valid sebelum apapun ──
    if (!isContextValid()) {
      showStatus(statusDiv, "⚠️ Extension direload — refresh halaman dulu!", "#ffcc00");
      return;
    }

    const items = scanBankItems();

    if (items.length === 0) {
      showStatus(statusDiv, "❌ No items found!", "#ff6b6b");
      return;
    }

    // ── Simpan ke storage dengan try-catch untuk tangkap context invalidated ──
    try {
      chrome.storage.local.set({
        rf_bank_items: items,
        rf_bank_scanned_at: Date.now(),
        rf_loaded_items: items,
        rf_loaded_selected: items.map(i => i.id)
      }, () => {
        // Callback bisa terjadi setelah context invalidated — cek lagi
        if (!isContextValid() || chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError
            ? chrome.runtime.lastError.message
            : "Extension context invalid";
          // Jangan akses statusDiv jika sudah detached, wrap dengan try
          try {
            showStatus(statusDiv, "⚠️ " + msg, "#ffcc00");
          } catch (_) {}
          return;
        }
        showStatus(statusDiv, `✅ ${items.length} item(s) scanned!`, "#6bff9e");
      });
    } catch (e) {
      // "Extension context invalidated" error ditangkap di sini
      try {
        showStatus(statusDiv, "⚠️ Extension direload — refresh halaman dulu!", "#ffcc00");
      } catch (_) {}
    }
  });
}

injectScanButton();
} // end bank page guard