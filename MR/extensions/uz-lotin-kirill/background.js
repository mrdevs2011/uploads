importScripts("converter.js");

const DEFAULTS = {
  mode: "replace",
  showNotification: true,
};

async function getSettings() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...data };
}

async function notify(title, message) {
  const settings = await getSettings();
  if (!settings.showNotification) return;
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title,
      message: message.length > 180 ? message.slice(0, 177) + "..." : message,
    });
  } catch (e) {
    /* ignore */
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(null);
  if (!current.mode) {
    await chrome.storage.sync.set(DEFAULTS);
  }
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "uz-convert-selection",
      title: "Lotin ↔ Kirill (clipboard)",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "uz-convert-selection") return;
  const text = info.selectionText || "";
  if (!text) return;
  const settings = await getSettings();
  const converted = UZ_CONVERTER.convert(text, settings.mode);
  if (tab && tab.id != null) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "COPY_TEXT", text: converted });
    } catch (e) {
      /* sahifa yangilanmagan bo‘lishi mumkin */
    }
  }
  await notify("Clipboardga nusxalandi", converted);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "CONVERT_TEXT") {
    getSettings().then((settings) => {
      sendResponse({
        converted: UZ_CONVERTER.convert(message.text || "", settings.mode),
        mode: settings.mode,
      });
    });
    return true;
  }

  if (message.type === "COPIED") {
    if (message.converted) {
      notify("Clipboardga nusxalandi", message.converted);
    }
  }
});
