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
  // dataUpg is a signed 32-bit int stored as string
  // Upgrade level is encoded in bits 28-30 (3 bits)
  // 0x0FFFFFFF / 0x7FFFFFFF = +0 (no upgrade)
  // 0x70000000 = +7, 0x60000000 = +6, etc.
  const val = parseInt(dataUpg) >>> 0; // treat as unsigned 32-bit
  const upg = (val >>> 28) & 0x7;
  // Values 0xF (15) and 0x7 with lower bits all 1 = no upgrade
  if (val === 0x0FFFFFFF || val === 0x7FFFFFFF || val === 0xFFFFFFFF) return 0;
  return upg;
}

function scanBankItems() {
  const items = [];
  const allRows = document.querySelectorAll("#porm tr");

  // Track seen item serials to avoid duplicates (each item appears in 2 rows)
  const seen = new Set();

  allRows.forEach((row, idx) => {
    // Skip header rows
    if (row.querySelector("th.success")) return;

    const tds = row.querySelectorAll("td");
    if (tds.length < 3) return;

    // tds[0]=checkbox, tds[1]=# number, tds[2]=item info
    const itemTd = tds[2];
    if (!itemTd) return;

    const innerTds = itemTd.querySelectorAll("table td");
    if (innerTds.length < 2) return;

    const infoTd = innerTds[1];

    // Item code from first <b> like "(ihcwb67)"
    let itemCode = "";
    let itemName = "";
    const boldEls = infoTd.querySelectorAll("b");
    for (const b of boldEls) {
      const txt = b.textContent.trim();
      if (txt.startsWith("(") && txt.endsWith(")")) {
        itemCode = txt.slice(1, -1);
      }
    }
    // Item name from anchor span
    const nameEl = infoTd.querySelector("a span b, a.tooltipx span b, a.rzr_id span b");
    if (nameEl) itemName = nameEl.textContent.trim();

    if (!itemCode) return;

    // Dedup by item serial (last column td or anchor href)
    const serialLink = row.querySelector("a[href*='item_ser=']");
    const serial = serialLink ? serialLink.textContent.trim() : `${itemCode}_${idx}`;
    if (seen.has(serial)) return;
    seen.add(serial);

    // Quantity / Durability / Ammo — semua masuk ke qty sebagai Amount di Give Item
    let qty = 1;
    for (const d of infoTd.querySelectorAll("div")) {
      const txt = d.textContent.trim();
      // Quantity (potion, consumable)
      let m = txt.match(/^Quantity\s*:\s*([\d,]+)$/);
      if (m) { qty = parseInt(m[1].replace(/,/g, "")); break; }
      // Durability (senjata / armor)
      m = txt.match(/^Durability\s*:\s*([\d,]+)$/);
      if (m) { qty = parseInt(m[1].replace(/,/g, "")); break; }
      // Ammo
      m = txt.match(/^Ammo\s*:\s*([\d,]+)$/);
      if (m) { qty = parseInt(m[1].replace(/,/g, "")); break; }
    }

    // Talic
    const talic = getTalicInfo(infoTd);

    // Upgrade from data-upg attribute
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

function injectScanButton() {
  if (document.getElementById("erza-bank-scanner")) return;

  // Cari button Search dari halaman
  const searchBtn = document.querySelector("button.btn.btn-success");
  if (!searchBtn) {
    // Fallback: kalau Search button belum ada, coba lagi setelah 500ms
    setTimeout(injectScanButton, 500);
    return;
  }

  // Buat status div (tetap di fixed position agar tidak ganggu layout)
  const statusDiv = document.createElement("div");
  statusDiv.id = "erza-scan-status";
  statusDiv.style.cssText =
    "position:fixed;bottom:24px;right:24px;z-index:99999;" +
    "background:#1a1a2e;color:#e0e0e0;padding:6px 12px;" +
    "border-radius:6px;font-size:12px;display:none;border:1px solid #444;";
  document.body.appendChild(statusDiv);

  // Buat button Scan — clone style dari Search button (btn btn-success)
  const scanBtn = document.createElement("button");
  scanBtn.id = "erza-bank-scanner";
  scanBtn.type = "button";
  scanBtn.className = searchBtn.className; // salin class btn btn-success
  scanBtn.innerHTML = 'Copy Bank Items';

  // Sisipkan tepat setelah Search button dengan sedikit jarak
  scanBtn.style.marginLeft = "8px";
  searchBtn.parentNode.insertBefore(scanBtn, searchBtn.nextSibling);

  scanBtn.addEventListener("click", () => {
    const items = scanBankItems();
    if (items.length === 0) {
      statusDiv.textContent = "❌ No items found!";
      statusDiv.style.display = "block";
      statusDiv.style.color = "#ff6b6b";
    } else {
      if (typeof chrome === "undefined" || !chrome.storage) {
        statusDiv.textContent = "⚠️ chrome.storage not available";
        statusDiv.style.display = "block";
        statusDiv.style.color = "#ffcc00";
        setTimeout(() => { statusDiv.style.display = "none"; }, 3000);
        return;
      }
      chrome.storage.local.set({
        rf_bank_items: items,
        rf_bank_scanned_at: Date.now(),
        rf_loaded_items: items,
        rf_loaded_selected: items.map(i => i.id)
      }, () => {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = "⚠️ " + chrome.runtime.lastError.message;
          statusDiv.style.color = "#ffcc00";
        } else {
          statusDiv.textContent = `✅ ${items.length} item(s) scanned!`;
          statusDiv.style.color = "#6bff9e";
        }
        statusDiv.style.display = "block";
        setTimeout(() => { statusDiv.style.display = "none"; }, 3000);
      });
      return;
    }
    setTimeout(() => { statusDiv.style.display = "none"; }, 3000);
  });
}

injectScanButton();
} // end bank page guard
