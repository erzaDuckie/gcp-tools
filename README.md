# GCP TOOLS by ERZA

All-in-one Chrome Extension untuk GCP Warden admin panel.

## Fitur
- ⚡ Bulk CPT — Edit level, CPT, playtime massal
- 🎁 Bulk Insert High — Insert paket high ke banyak player
- ⚔️ Bulk Change Race — Ganti race & job massal (dengan deteksi skip jika sudah sama)
- 🎒 Edit Inventory — Edit inventory player langsung

---

## Cara Install (Pertama Kali)

1. Download **GCP_TOOLS_latest.zip** dari halaman [Releases](../../releases/latest)
2. Extract ke folder mana saja (misal `F:\EXTENSION\GCP_TOOLS`)
3. Buka Chrome → `chrome://extensions/`
4. Aktifkan **Developer mode** (toggle kanan atas)
5. Klik **Load unpacked** → pilih folder hasil extract
6. Extension siap dipakai ✅

---

## Cara Update (Versi Baru)

Saat ada update, popup extension akan otomatis menampilkan banner **"🔔 Update Tersedia!"**

1. Klik tombol **⬇ Download** di banner popup
2. Extract **GCP_TOOLS_latest.zip** yang terdownload
3. **Replace/overwrite** semua file ke folder extension yang sama (jangan hapus foldernya!)
4. Buka `chrome://extensions/`
5. Klik tombol **reload (🔄)** di card GCP TOOLS
6. Selesai ✅ — tidak perlu install ulang dari awal

---

## Cara Release Update Baru (untuk ERZA)

1. Edit file yang perlu diubah (popup.js, dll)
2. Update `"version"` di **manifest.json** → misal `"3.0a"` → `"3.1"`
3. Update juga konstanta `LOCAL_VERSION` di **popup.js** supaya sama
4. Zip semua file → rename jadi **`GCP_TOOLS_latest.zip`**
5. Push semua file + zip ke GitHub
6. Buat **Release** baru di GitHub dengan tag versi yang sama, upload `GCP_TOOLS_latest.zip` sebagai asset

> Extension semua user akan otomatis mendeteksi versi baru saat popup dibuka berikutnya.

---

Made by **ERZA** · [Discord](https://discord.com/users/334621293125304331)
