// Background service worker: opens the popup as a persistent window so it
// stays open when the user clicks elsewhere (unlike default_popup behaviour).

const POPUP_URL = chrome.runtime.getURL("src/entrypoints/popup/index.html");
const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 600;

let popupWindowId: number | null = null;

async function openPopupWindow(): Promise<void> {
  // If the window is already open, focus it.
  if (popupWindowId !== null) {
    try {
      await chrome.windows.update(popupWindowId, { focused: true });
      return;
    } catch {
      // Window was closed externally — fall through to create a new one.
      popupWindowId = null;
    }
  }

  const win = await chrome.windows.create({
    url: POPUP_URL,
    type: "popup",
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    focused: true,
  });

  popupWindowId = win?.id ?? null;
}

chrome.action.onClicked.addListener(() => {
  openPopupWindow().catch(() => undefined);
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupWindowId) {
    popupWindowId = null;
  }
});
