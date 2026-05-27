# GCP TOOLS by ERZA

All-in-one Chrome Extension untuk GCP Warden admin panel.

## Fitur
- ⚡ **Bulk CPT** — Edit level, CPT, playtime massal
- 🎁 **Bulk Insert High** — Insert paket high ke banyak player
- ⚔️ **Bulk Change Race** — Ganti race & job massal
- 🔧 **EZ Fix** — Scan & fix race item inventory (Old Version & New Version)
- ⚡ **Auto Talic +7** — Isi semua slot talic item secara otomatis

---

## Cara Install (Pertama Kali)

1. Download file **zip** extension terbaru
2. Extract ke folder mana saja, contoh: `C:\GCP_TOOLS`
3. Buka Chrome → ketik di address bar: `chrome://extensions/`
4. Aktifkan **Developer mode** (toggle di pojok kanan atas)
5. Klik tombol **Load unpacked**
6. Pilih folder hasil extract tadi
7. Extension siap dipakai ✅

---

## Cara Update (Versi Baru)

1. Download file zip versi terbaru
2. Extract dan **replace/overwrite** semua file ke folder extension yang lama
   > ⚠️ Jangan hapus foldernya, cukup timpa file-file lama
3. Buka `chrome://extensions/`
4. Klik ikon **reload (🔄)** di card GCP TOOLS
5. Selesai ✅ — tidak perlu install ulang dari awal

---

## Changelog

### v3.3.0
- ⚙️ **Tab Settings baru** di launcher — konfigurasi terpusat (Auto Login + Database Manager)
- 🔐 **Auto Login** — isi username, password & PIN otomatis saat buka halaman login GCP. Pantau Turnstile Cloudflare → klik login & PIN otomatis setelah CF selesai
- 🗄 **Database Manager** — daftarkan Google Sheet ID per domain server. EZ Fix otomatis pakai database yang sesuai tanpa hardcode SHEET_ID
- 🛡 **CF Interstitial Guard** — semua bulk (CPT, High, Medium, Race) kini mendeteksi halaman "Just a moment" Cloudflare. Bulk pause otomatis & tunggu CF resolve, lalu lanjut tanpa error
- 🔧 Fix tombol INSERT High & Medium — sebelumnya langsung klik tanpa tunggu CF widget. Kini polling sampai enabled (max 30s)
- 🔧 EZ Fix status bar tampilkan jumlah item & nama domain aktif

### v3.2.9
- ✅ Give Item Helper — integrasi ke launcher GCP Tools
- ✅ Scan item dari Bank Remove page via tombol Copy Bank Items
- ✅ Preset system — buat, simpan, load, edit, dan hapus preset item
- ✅ Universal — bekerja di semua server GameCP RF (*.gamecp.net)
- 🔧 Fix popup dobel — service worker simpan windowId ke storage.session
- 🔧 Fix Select2 label — pakai initSelection asli agar nama item muncul benar

### v3.2.8
- ✅ Weapon selector Medium berdasarkan type (Knife/Sword/Spear/Axe/Hammer/Staff/Bow/Firearm/Launcher/Flamethrower/Grenade/Throwing)
- ✅ Universal — item dicari via keyword nama, bukan hardcode value
- ✅ Accessories (Shield, Booster, Amulet, Ring) digabung 1 tombol Defense/Avoid

### v3.2.7
- ✅ Fitur baru: **Bulk Insert Medium** — insert paket medium ke banyak player sekaligus
- ✅ Support batch & progress bar
- ✅ Auto skip jika character tidak ditemukan atau sudah claim

### v3.2.6
- 🎨 Redesign UI popup launcher — tampilan lebih modern & compact
- 🎨 Redesign UI Bulk CPT, Bulk Insert High, Bulk Change Race
- 🎨 Redesign panel EZ Fix — header, player chip, scan list, type buttons
- ✅ Semua fungsi & logika tidak berubah

### v3.2.4
- ✅ Support **New Version** edit inventory (Select2 dropdown) — scan & fix item code
- ✅ Fix focus/scroll ke elemen Select2 saat klik item di panel EZ Fix
- ✅ Fix posisi popup weapon selector untuk New Version
- ⚡ Tombol **⚡+7 Talic** otomatis — muncul di setiap item upgradeable (weapon, armor, cloak, shield)
- ⚡ Klik ⚡+7: tekan [ − ] 7x lalu [ + ] 7x instan sesuai talic yang dipilih
- 🗑️ Hapus Edit Inven box dari launcher
- 🗑️ Hapus auto-update checker & link GitHub

### v3.0.2
- ✅ Bulk CPT — edit level, CPT, playtime massal
- ✅ Bulk Insert High — insert paket high ke banyak player
- ✅ Bulk Change Race — ganti race & job massal
- ✅ EZ Fix — scan & fix race item inventory (Old Version)

---

Made by **ERZA** · [Discord](https://discord.com/users/334621293125304331)
