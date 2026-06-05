// ═══════════════════════════════════════════════════
//  GCP TOOLS — content_autologin.js  v3.5.0
//  Auto Login + Auto PIN untuk *.gamecp.net
//
//  LOGIN selectors (confirmed):
//    #username, #password, #ok-gas
//    input[name="cf-turnstile-response"]
//
//  PIN selectors (confirmed):
//    #viewPINInput  — display PIN (text)
//    #input_pin     — hidden field yang dikirim ke server
//    #btnPin0..9    — btnPin0="1", btnPin1="2",..., btnPin9="0"
//    #btnPinClear   — clear
//    .btn-success   — SUBMIT (tidak ada id)
//    input[name="cf-turnstile-response"] — Turnstile (ada di PIN juga)
//
//  Flow:
//    LOGIN:
//      1. Isi #username + #password otomatis
//      2. Tampilkan banner
//      3. Pantau Turnstile → klik #ok-gas otomatis
//    PIN:
//      1. Deteksi halaman PIN (#viewPINInput + #input_pin)
//      2. Pantau Turnstile PIN → setelah solved, klik digit PIN otomatis
//      3. Klik SUBMIT otomatis → tetap di halaman admin (session PIN aktif)
// ═══════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Domain dinamis — otomatis sesuai tab yang aktif ──
  const currentHost = window.location.hostname; // e.g. "warden.gamecp.net"

  // ── Map: digit '0'-'9' → id button ───────────────
  // Confirmed: btnPin0="1", btnPin1="2",..., btnPin8="9", btnPin9="0"
  const DIGIT_TO_BTN = {
    '1': 'btnPin0', '2': 'btnPin1', '3': 'btnPin2',
    '4': 'btnPin3', '5': 'btnPin4', '6': 'btnPin5',
    '7': 'btnPin6', '8': 'btnPin7', '9': 'btnPin8',
    '0': 'btnPin9'
  };

  // ════════════════════════════════════════════════
  //  DETEKSI HALAMAN
  // ════════════════════════════════════════════════

  function isLoginPage() {
    return !!document.querySelector('#username') &&
           !!document.querySelector('#password') &&
           !!document.querySelector('#ok-gas');
  }

  function isPinPage() {
    return !!document.querySelector('#viewPINInput') &&
           !!document.querySelector('#input_pin') &&
           !!document.querySelector('#btnPin9');
  }

  // ════════════════════════════════════════════════
  //  BANNER
  // ════════════════════════════════════════════════

  function showBanner(msg, color) {
    let banner = document.getElementById('gcptools-autologin-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'gcptools-autologin-banner';
      banner.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
        'color:#e2e8f0', 'font-family:sans-serif', 'font-size:12px',
        'padding:9px 16px', 'text-align:center',
        'display:flex', 'align-items:center', 'justify-content:center', 'gap:8px',
        'box-shadow:0 2px 8px rgba(0,0,0,0.4)'
      ].join(';');
      banner.innerHTML =
        '<span id="gcptools-banner-icon" style="font-size:16px;">🔑</span>' +
        '<span id="gcptools-banner-text"></span>';
      document.body.insertBefore(banner, document.body.firstChild);
    }
    updateBanner(msg, color || '#1a2f4e', color ? '#68d391' : '#3b82f6');
  }

  function updateBanner(text, bgColor, borderColor) {
    const banner = document.getElementById('gcptools-autologin-banner');
    if (!banner) return;
    banner.style.background   = bgColor;
    banner.style.borderBottom = '2px solid ' + borderColor;
    const textEl = document.getElementById('gcptools-banner-text');
    if (textEl) textEl.innerHTML = text;
  }

  // ════════════════════════════════════════════════
  //  CLOUDFLARE TURNSTILE WATCHER
  //  onDone() dipanggil setelah token terisi
  // ════════════════════════════════════════════════

  function watchTurnstile(onDone) {
    const cfInput = document.querySelector('input[name="cf-turnstile-response"]');
    const maxMs   = 3 * 60 * 1000;
    const start   = Date.now();

    // Tidak ada CF widget di halaman ini — langsung lanjut
    if (!cfInput) {
      onDone(); return;
    }

    // Cek langsung — kadang CF sudah auto-resolve
    if (cfInput.value && cfInput.value.length > 10) {
      onDone(); return;
    }

    const timer = setInterval(() => {
      if (Date.now() - start > maxMs) {
        clearInterval(timer);
        console.warn('[AutoLogin] Timeout Turnstile');
        return;
      }
      if (cfInput.value && cfInput.value.length > 10) {
        clearInterval(timer);
        onDone();
      }
    }, 800);
  }

  // ════════════════════════════════════════════════
  //  LOGIN HANDLER
  // ════════════════════════════════════════════════

  async function handleLogin(username, password) {
    await new Promise(r => setTimeout(r, 600));

    const userInput = document.querySelector('#username');
    const passInput = document.querySelector('#password');
    const loginBtn  = document.querySelector('#ok-gas');

    if (!userInput || !passInput || !loginBtn) {
      console.warn('[AutoLogin] Elemen login tidak ditemukan'); return;
    }

    userInput.focus();
    userInput.value = username;
    userInput.dispatchEvent(new Event('input',  { bubbles: true }));
    userInput.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));

    passInput.focus();
    passInput.value = password;
    passInput.dispatchEvent(new Event('input',  { bubbles: true }));
    passInput.dispatchEvent(new Event('change', { bubbles: true }));
    passInput.blur();

    showBanner(
      '<b>GCP Tools Auto Login</b> &mdash; ' +
      'Username &amp; password terisi. ' +
      '<span style="color:#fbbf24;">Selesaikan Cloudflare &rarr; Login diklik otomatis.</span>'
    );

    watchTurnstile(() => {
      console.log('[AutoLogin] Turnstile login selesai — klik Login...');
      updateBanner(
        '<b>✅ Cloudflare selesai — Login otomatis...</b>',
        '#22543d', '#68d391'
      );
      setTimeout(() => loginBtn.click(), 600);
    });
  }

  // ════════════════════════════════════════════════
  //  PIN HANDLER
  // ════════════════════════════════════════════════

  async function handlePin(pin) {
    await new Promise(r => setTimeout(r, 600));

    const submitBtn = document.querySelector('.btn-success');
    if (!submitBtn) {
      console.warn('[AutoLogin] Tombol SUBMIT PIN tidak ditemukan'); return;
    }

    showBanner(
      '<b>🔐 GCP Tools Auto PIN</b> &mdash; ' +
      '<span style="color:#fbbf24;">Menunggu Cloudflare selesai &rarr; PIN diklik otomatis.</span>'
    );

    watchTurnstile(async () => {
      console.log('[AutoLogin] Turnstile PIN selesai — input PIN otomatis...');
      updateBanner('<b>⌨️ Memasukkan PIN otomatis...</b>', '#1a2f4e', '#3b82f6');

      // Klik digit satu per satu dengan delay
      for (const digit of pin) {
        const btnId = DIGIT_TO_BTN[digit];
        if (!btnId) continue;
        const btn = document.querySelector('#' + btnId);
        if (btn) {
          btn.click();
          await new Promise(r => setTimeout(r, 150));
        }
      }

      await new Promise(r => setTimeout(r, 400));

      updateBanner('<b>✅ PIN terisi — Submit otomatis...</b>', '#22543d', '#68d391');
      await new Promise(r => setTimeout(r, 400));
      submitBtn.click();
      // Selesai — tetap di halaman admin, session PIN aktif sampai logout / ganti IP
    });
  }

  // ════════════════════════════════════════════════
  //  MAIN
  // ════════════════════════════════════════════════

  function main() {
    chrome.storage.local.get(
      ['autologin_enabled', 'autologin_username', 'autologin_password', 'autologin_pin'],
      async function(data) {
        if (!data.autologin_enabled) return;

        if (isLoginPage()) {
          const username = (data.autologin_username || '').trim();
          const password = data.autologin_password || '';
          if (!username || !password) {
            console.warn('[AutoLogin] Credentials belum diset di Settings.'); return;
          }
          console.log('[AutoLogin] Halaman LOGIN terdeteksi');
          await handleLogin(username, password);

        } else if (isPinPage()) {
          const pin = (data.autologin_pin || '').trim();
          if (!pin) {
            console.warn('[AutoLogin] PIN belum diset di Settings.'); return;
          }
          console.log('[AutoLogin] Halaman PIN terdeteksi — PIN:', '*'.repeat(pin.length));
          await handlePin(pin);
        }
      }
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

})();