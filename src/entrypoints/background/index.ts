// Background service worker: opens the popup as a persistent window so it
// stays open when the user clicks elsewhere (unlike default_popup behaviour).

const POPUP_URL = chrome.runtime.getURL("src/entrypoints/popup/index.html");
const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 600;

let popupWindowId: number | null = null;
let opening = false;

async function openPopupWindow(tab: chrome.tabs.Tab): Promise<void> {
  const url = new URL(POPUP_URL);
  if (tab.id !== undefined) url.searchParams.set("sourceTabId", String(tab.id));
  // Recover an existing reader after the MV3 service worker wakes up again.
  if (popupWindowId === null) {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["popup"] });
    popupWindowId = windows.find((win) => win.tabs?.some((item) => item.url?.startsWith(POPUP_URL)))?.id ?? null;
  }
  // If the window is already open, focus it.
  if (popupWindowId !== null) {
    try {
      const existing = await chrome.windows.get(popupWindowId, { populate: true });
      const reader = existing.tabs?.find((item) => item.url?.startsWith(POPUP_URL));
      if (reader?.id !== undefined && reader.url !== url.toString()) {
        await chrome.tabs.update(reader.id, { url: url.toString() });
      }
      await chrome.windows.update(popupWindowId, { focused: true });
      return;
    } catch {
      // Window was closed externally — fall through to create a new one.
      popupWindowId = null;
    }
  }

  const win = await chrome.windows.create({
    url: url.toString(),
    type: "popup",
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    focused: true,
  });

  popupWindowId = win?.id ?? null;
}

chrome.action.onClicked.addListener((tab) => {
  if (opening) return;
  opening = true;
  openPopupWindow(tab).catch(() => undefined).finally(() => { opening = false; });
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupWindowId) {
    popupWindowId = null;
  }
});
