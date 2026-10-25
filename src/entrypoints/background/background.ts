import { readerWindowBounds } from "../../services/readerWindow";

// Optional persistent reader. Normal toolbar clicks use the anchored popup.

const POPUP_URL = chrome.runtime.getURL("src/entrypoints/popup/index.html");

let popupWindowId: number | null = null;
let opening = false;

async function openPopupWindow(tab: chrome.tabs.Tab): Promise<void> {
  const url = new URL(POPUP_URL);
  if (tab.id !== undefined) url.searchParams.set("sourceTabId", String(tab.id));
  const source = await chrome.windows.get(tab.windowId);
  const fallback = { left: source.left ?? 0, top: source.top ?? 0, width: source.width ?? 1024, height: source.height ?? 768 };
  let area = fallback;
  if (tab.id !== undefined) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const display = screen as Screen & { availLeft?: number; availTop?: number };
          return { left: display.availLeft ?? 0, top: display.availTop ?? 0, width: display.availWidth, height: display.availHeight };
        },
      });
      if (results[0]?.result?.width && results[0]?.result?.height) area = results[0].result;
    } catch { /* Restricted tabs cannot execute a script; use source window bounds. */ }
  }
  const bounds = readerWindowBounds(fallback, area);
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
      await chrome.windows.update(popupWindowId, { state: "normal" });
      await chrome.windows.update(popupWindowId, { ...bounds, focused: true });
      return;
    } catch {
      // Window was closed externally — fall through to create a new one.
      popupWindowId = null;
    }
  }

  const win = await chrome.windows.create({
    url: url.toString(),
    type: "popup",
    ...bounds,
    state: "normal",
    focused: true,
  });

  popupWindowId = win?.id ?? null;
}

// The toolbar uses Chrome's anchored popup. A persistent window is opt-in.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "OPEN_READER_WINDOW" || sender.id !== chrome.runtime.id
    || !sender.url?.startsWith(POPUP_URL) || !Number.isInteger(message.tabId)) return false;
  if (opening) { sendResponse({ ok: false, error: "Reader is already opening." }); return false; }
  opening = true;
  chrome.tabs.get(message.tabId).then(openPopupWindow)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: String(error) }))
    .finally(() => { opening = false; });
  return true;
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupWindowId) {
    popupWindowId = null;
  }
});
