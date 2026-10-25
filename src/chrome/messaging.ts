function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return JSON.stringify(error) || "Unknown error";
}

function isMissingReceiverError(error: unknown): boolean {
  const message = normalizeErrorMessage(error);
  return message.includes("Receiving end does not exist") || message.includes("Could not establish connection");
}

const injections = new Map<number, Promise<void>>();

async function requestTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      chrome.tabs.sendMessage(tabId, message) as Promise<T>,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("The page did not respond within 15 seconds. Try Scan again; if it persists, reload the source tab.")), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  try {
    return await requestTabMessage<T>(tabId, message);
  } catch (error) {
    if (!isMissingReceiverError(error)) throw new Error(normalizeErrorMessage(error));
    // Existing tabs lose their content-script receiver when the extension reloads.
    // Reinstall the declared bundle rather than reloading the user's webpage.
    let injecting = injections.get(tabId);
    if (!injecting) {
      injecting = (async () => {
        const files = chrome.runtime.getManifest().content_scripts?.flatMap((script) => script.js ?? []) ?? [];
        if (!files.length) throw new Error("No content script is configured.");
        await chrome.scripting.executeScript({ target: { tabId }, files });
      })();
      injections.set(tabId, injecting);
      void injecting.finally(() => injections.delete(tabId)).catch(() => undefined);
    }
    try { await injecting; }
    catch { throw new Error("This page does not allow extension scanning. Open a regular webpage and try again."); }
    // The generated loader imports its module asynchronously.
    for (let attempt = 0; attempt < 10; attempt++) {
      try { return await requestTabMessage<T>(tabId, message); }
      catch (retryError) {
        if (!isMissingReceiverError(retryError)) throw new Error(normalizeErrorMessage(retryError));
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error("Content script is not available on this tab yet.");
  }
}
