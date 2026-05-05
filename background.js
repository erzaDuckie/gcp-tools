// Simpan windowId agar tidak buka dobel
let toolWindowId = null;

chrome.action.onClicked.addListener(async () => {
  // Cek apakah window sebelumnya masih ada
  if (toolWindowId !== null) {
    try {
      const win = await chrome.windows.get(toolWindowId);
      // Kalau masih ada, fokus ke sana
      await chrome.windows.update(toolWindowId, { focused: true });
      return;
    } catch (e) {
      // Window sudah ditutup, reset id
      toolWindowId = null;
    }
  }

  // Buka window baru
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 360,
    height: 870,
    focused: true
  });
  toolWindowId = win.id;

  // Reset saat window ditutup
  chrome.windows.onRemoved.addListener(function onRemoved(id) {
    if (id === toolWindowId) {
      toolWindowId = null;
      chrome.windows.onRemoved.removeListener(onRemoved);
    }
  });
});
