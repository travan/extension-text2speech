export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const sourceTabId = Number(new URL(globalThis.location.href).searchParams.get("sourceTabId"));
  if (Number.isInteger(sourceTabId) && sourceTabId > 0) {
    return chrome.tabs.get(sourceTabId);
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

export async function openTab(url: string): Promise<void> {
  await chrome.tabs.create({ url });
}

export async function activateTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.update(tabId, { active: true });
  if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
}

export async function reloadTab(tabId: number): Promise<void> {
  await chrome.tabs.reload(tabId);
}

export function runtimeUrl(path: string): string {
  return chrome.runtime.getURL(path);
}
