// give_page_helper.js — berjalan di MAIN world (page context), bisa akses jQuery
// Komunikasi dengan content_give.js via CustomEvent
// Berlaku untuk: Give Item single (admin_manage_give_item_std)
//            dan Give Item multi  (admin_manage_give_item_mulchars)

(function() {

const doParam = new URLSearchParams(window.location.search).get("do");
const IS_GIVE = doParam === "admin_manage_give_item_std" ||
                doParam === "admin_manage_give_item_mulchars";

if (!IS_GIVE) return;

document.addEventListener("__rfGiveInitAndFill", function(e) {
  var items = e.detail.items; // [{inputId, code, name}]
  if (typeof $ === "undefined" || typeof $select2_options === "undefined") {
    console.warn("[RF-GIVE-PAGE] jQuery atau $select2_options tidak tersedia");
    return;
  }

  // Pakai $select2_options ASLI (dengan initSelection) — biarkan server handle display.
  try {
    $(".item_code_ajax").select2($select2_options);
  } catch(err) {
    console.warn("[RF-GIVE-PAGE] select2 init err:", err);
  }

  // Trigger initSelection per input — AJAX ke server, return { id, name, index }
  // FIX: pakai IIFE untuk capture $inp per-iterasi (hindari closure bug dengan var)
  for (var i = 0; i < items.length; i++) {
    (function(d) {
      try {
        var $inp = $("#" + d.inputId);
        if (!$inp.length) {
          console.warn("[RF-GIVE-PAGE] Element tidak ketemu: #" + d.inputId);
          return;
        }
        var s2 = $inp.data("select2");
        if (!s2) {
          console.warn("[RF-GIVE-PAGE] Select2 tidak attach pada #" + d.inputId);
          return;
        }
        if (typeof s2.opts.initSelection === "function") {
          s2.opts.initSelection($inp, function(data) {
            if (data) $inp.select2("data", data);  // $inp ter-capture dengan benar
          });
        }
      } catch(err) {
        console.warn("[RF-GIVE-PAGE] initSelection err " + d.inputId + ":", err);
      }
    })(items[i]);
  }

  document.dispatchEvent(new CustomEvent("__rfGiveFillDone"));
});

})();
