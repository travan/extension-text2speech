export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

export async function openTab(url: string): Promise<void> {
  await chrome.tabs.create({ url });
}

export async function activateTab(tabId: number): Promise<void> {
  await chrome.tabs.update(tabId, { active: true });
}

export async function reloadTab(tabId: number): Promise<void> {
  await chrome.tabs.reload(tabId);
}

export function runtimeUrl(path: string): string {
  return chrome.runtime.getURL(path);
}
