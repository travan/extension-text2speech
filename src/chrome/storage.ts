type StorageValue = string | number | boolean | null | undefined | object;

export async function getLocal(keys?: string | string[] | null): Promise<Record<string, unknown>> {
  return (await chrome.storage.local.get(keys ?? null)) as Record<string, unknown>;
}

export async function setLocal(payload: Record<string, StorageValue>): Promise<void> {
  await chrome.storage.local.set(payload);
}

export async function removeLocal(keys: string | string[]): Promise<void> {
  await chrome.storage.local.remove(keys);
}

function getSessionArea(): chrome.storage.StorageArea {
  return chrome.storage.session ?? chrome.storage.local;
}

export async function getSession(keys?: string | string[] | null): Promise<Record<string, unknown>> {
  return (await getSessionArea().get(keys ?? null)) as Record<string, unknown>;
}

export async function setSession(payload: Record<string, StorageValue>): Promise<void> {
  await getSessionArea().set(payload);
}

export async function removeSession(keys: string | string[]): Promise<void> {
  await getSessionArea().remove(keys);
}
