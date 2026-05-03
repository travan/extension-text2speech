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

export async function sendTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  } catch (error) {
    if (isMissingReceiverError(error)) {
      throw new Error("Content script is not available on this tab yet.");
    }
    throw new Error(normalizeErrorMessage(error));
  }
}
