/* ══════════════════════════════════════════════════════════════
   GCP TOOLS — sidebar.js  (Sidebar Navigation + popup.js shim)
   Harus di-load SEBELUM popup.js
   ══════════════════════════════════════════════════════════════ */
(function () {

  /* ─────────────────────────────────────────────────────────────
     1. PANEL NAVIGATOR
     Map ID lama (view-*) → ID panel baru (panel-*), dan sebaliknya
     ───────────────────────────────────────────────────────────── */
  var VIEW_TO_PANEL = {
    'view-launcher': 'panel-home',
    'view-cpt':      'panel-cpt',
    'view-package':  'panel-package',
    'view-race':     'panel-race',
    'view-give':     'panel-give'
  };

  var VIEW_LABELS = {
    'panel-home':    'HOME',
    'panel-cpt':     'BULK CPT',
    'panel-package': 'BULK PACKAGE',
    'panel-race':    'CHANGE RACE',
    'panel-give':    'GIVE ITEM',
    'panel-log':     'LOG UPDATE',
    'panel-settings':'SETTINGS'
  };

  var allPanels    = null;
  var sidebarItems = null;
  var pageLabel    = null;

  function getPanelId(id) {
    // Terima panel-* langsung, atau convert dari view-*
    return VIEW_TO_PANEL[id] || id;
  }

  function navigateTo(panelId) {
    panelId = getPanelId(panelId);

    if (!allPanels)    allPanels    = document.querySelectorAll('.panel');
    if (!sidebarItems) sidebarItems = document.querySelectorAll('.sidebar-item[data-nav]');
    if (!pageLabel)    pageLabel    = document.getElementById('header-page-label');

    // Sembunyikan semua panel
    allPanels.forEach(function (p) { p.style.display = 'none'; });

    // Tampilkan panel target
    var target = document.getElementById(panelId);
    if (target) target.style.display = 'flex';

    // Update active state sidebar
    sidebarItems.forEach(function (item) {
      item.classList.toggle('active', item.dataset.nav === panelId);
    });

    // Update header label
    if (pageLabel) pageLabel.textContent = VIEW_LABELS[panelId] || '';

    // Tutup sidebar
    var appBody = document.getElementById('app-body');
    if (appBody) appBody.classList.remove('sidebar-open');
  }

  /* ─────────────────────────────────────────────────────────────
     2. OVERRIDE showView — dipakai popup.js dengan ID lama
     ───────────────────────────────────────────────────────────── */
  window.showView = function (id) {
    navigateTo(id);
    // Scroll reset (seperti perilaku asli popup.js)
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  /* ─────────────────────────────────────────────────────────────
     3. SHIM ELEMEN — buat elemen dummy dengan ID lama
     popup.js langsung getElementById('goto-cpt') dll. Kalau null → crash.
     Solusi: inject hidden <button> dengan ID lama, tapi event-nya
     diarahkan ke navigateTo().
     ───────────────────────────────────────────────────────────── */
  var SHIM_BUTTONS = {
    'goto-cpt':          'panel-cpt',
    'goto-package':      'panel-package',
    'goto-race':         'panel-race',
    'goto-give':         'panel-give',
    'back-from-cpt':     'panel-home',
    'back-from-package': 'panel-home',
    'back-from-race':    'panel-home',
    'back-from-give':    'panel-home'
  };

  // Container tersembunyi untuk shim
  var shimContainer = document.createElement('div');
  shimContainer.id = 'shim-container';
  shimContainer.style.cssText = 'display:none!important;position:absolute;width:0;height:0;overflow:hidden;';
  document.body.appendChild(shimContainer);

  Object.keys(SHIM_BUTTONS).forEach(function (btnId) {
    // Jangan buat shim kalau elemen asli sudah ada di HTML
    if (!document.getElementById(btnId)) {
      var btn = document.createElement('button');
      btn.id = btnId;
      btn.style.display = 'none';
      shimContainer.appendChild(btn);
    }
    // Pasang listener ke elemen (asli atau shim)
    var el = document.getElementById(btnId);
    if (el) {
      el.addEventListener('click', function () {
        navigateTo(SHIM_BUTTONS[btnId]);
      });
    }
  });

  /* ─────────────────────────────────────────────────────────────
     4. SHIM view-* DIV — popup.js showView() lama juga pakai
     document.getElementById('view-cpt').classList → perlu ada
     ───────────────────────────────────────────────────────────── */
  var VIEW_SHIMS = ['view-launcher', 'view-cpt', 'view-package', 'view-race', 'view-give'];
  VIEW_SHIMS.forEach(function (viewId) {
    if (!document.getElementById(viewId)) {
      var div = document.createElement('div');
      div.id = viewId;
      div.className = 'view'; // punya class .view agar querySelectorAll('.view') tidak crash
      div.style.cssText = 'display:none!important;position:absolute;width:0;height:0;overflow:hidden;';
      shimContainer.appendChild(div);
    }
  });

  /* ─────────────────────────────────────────────────────────────
     5. SIDEBAR TOGGLE & OVERLAY
     ───────────────────────────────────────────────────────────── */
  var toggleBtn = document.getElementById('sidebar-toggle-btn');
  var appBody   = document.getElementById('app-body');
  var overlay   = document.getElementById('sidebar-overlay');

  if (toggleBtn && appBody) {
    toggleBtn.addEventListener('click', function () {
      appBody.classList.toggle('sidebar-open');
    });
  }
  if (overlay && appBody) {
    overlay.addEventListener('click', function () {
      appBody.classList.remove('sidebar-open');
    });
  }

  /* ─────────────────────────────────────────────────────────────
     6. SIDEBAR ITEM CLICKS
     ───────────────────────────────────────────────────────────── */
  document.querySelectorAll('.sidebar-item[data-nav]').forEach(function (item) {
    item.addEventListener('click', function () {
      navigateTo(item.dataset.nav);
    });
  });

  /* ─────────────────────────────────────────────────────────────
     7. HOME CARD CLICKS
     ───────────────────────────────────────────────────────────── */
  document.querySelectorAll('.home-card[data-nav]').forEach(function (card) {
    card.addEventListener('click', function () {
      navigateTo(card.dataset.nav);
    });
  });

  /* ─────────────────────────────────────────────────────────────
     8. DOMAIN SYNC — launcher-domain → semua sub panel
     ───────────────────────────────────────────────────────────── */
  var launcherDomain = document.getElementById('launcher-domain');
  if (launcherDomain) {
    launcherDomain.addEventListener('input', function () {
      var val = launcherDomain.value;
      ['cpt-domain','high-domain','medium-domain','race-domain','give-domain'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = val;
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────
     9. PACKAGE TAB SWITCHING — pkg-panel-high / medium
     popup.js menggunakan .classList.add('active') pada pkg-panel-*
     Di HTML baru pkg-panel pakai display:flex/none → override
     ───────────────────────────────────────────────────────────── */
  function switchPkgTab(show, hide) {
    var showEl = document.getElementById(show);
    var hideEl = document.getElementById(hide);
    if (showEl) showEl.style.display = 'flex';
    if (hideEl) hideEl.style.display = 'none';
  }

  // Override classList.add/remove untuk pkg-panel agar sync dengan display
  ['pkg-panel-high', 'pkg-panel-medium'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var origAdd    = el.classList.add.bind(el.classList);
    var origRemove = el.classList.remove.bind(el.classList);
    el.classList.add = function () {
      origAdd.apply(null, arguments);
      if (Array.from(arguments).includes('active')) el.style.display = 'flex';
    };
    el.classList.remove = function () {
      origRemove.apply(null, arguments);
      if (Array.from(arguments).includes('active')) el.style.display = 'none';
    };
  });

  var pkgTabHigh   = document.getElementById('pkg-tab-high');
  var pkgTabMedium = document.getElementById('pkg-tab-medium');
  if (pkgTabHigh) {
    pkgTabHigh.addEventListener('click', function () {
      switchPkgTab('pkg-panel-high', 'pkg-panel-medium');
    });
  }
  if (pkgTabMedium) {
    pkgTabMedium.addEventListener('click', function () {
      switchPkgTab('pkg-panel-medium', 'pkg-panel-high');
    });
  }

  /* ─────────────────────────────────────────────────────────────
     10. LICENSE GATE COMPAT
     popup.js di onLicenseValid() memanggil:
       allViews.forEach(v => { if (v.id !== 'view-license') v.style.removeProperty('display'); })
     → ini akan unhide semua .view termasuk shim. Tidak masalah karena
       shim punya style inline display:none!important, tapi panel-* asli
       perlu ikut aturan navigateTo().
     Kita intercept dengan memastikan setelah license valid, panel-home tampil.
     ───────────────────────────────────────────────────────────── */
  var _origRemoveProperty = CSSStyleDeclaration.prototype.removeProperty;
  CSSStyleDeclaration.prototype.removeProperty = function (prop) {
    var result = _origRemoveProperty.call(this, prop);
    // Kalau ini adalah .view yang bukan panel → tidak perlu special handling
    // Kalau ini adalah view-launcher (shim) → skip
    return result;
  };

  // Setelah license valid, pastikan panel-home visible dan panel lain hidden
  // Caranya: observe perubahan display pada view-license
  var licView = document.getElementById('view-license');
  if (licView && window.MutationObserver) {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type === 'attributes' && m.attributeName === 'style') {
          if (licView.style.display === 'none' || licView.style.display === '') {
            // License view disembunyikan → tampilkan panel home
            setTimeout(function () { navigateTo('panel-home'); }, 10);
            observer.disconnect();
          }
        }
      });
    });
    observer.observe(licView, { attributes: true });
  }

})();