(() => {
  function isMissingReceiverError(error) {
    const msg = String(error?.message || error || "");
    return msg.includes("Receiving end does not exist") || msg.includes("Could not establish connection");
  }

  function isRestrictedUrl(url) {
    if (!url) return true;
    return (
      url.startsWith("chrome://")
      || url.startsWith("chrome-extension://")
      || url.startsWith("edge://")
      || url.startsWith("about:")
      || url.startsWith("view-source:")
    );
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  async function getStorage(keys) {
    return chrome.storage.local.get(keys);
  }

  async function setStorage(payload) {
    return chrome.storage.local.set(payload);
  }

  function buildResultsUrl(tabId) {
    const url = new URL(chrome.runtime.getURL("results.html"));
    if (tabId) url.searchParams.set("tabId", String(tabId));
    return url.toString();
  }

  async function sendTabMessageWithAutoInject(tab, message) {
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      if (!isMissingReceiverError(error)) throw error;

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });

      return chrome.tabs.sendMessage(tab.id, message);
    }
  }

  async function requestSegmentsFromTab(tab, options = {}) {
    const level = Math.min(5, Math.max(1, Number(options.deepScanLevel) || 3));
    return sendTabMessageWithAutoInject(tab, {
      type: "EXTRACT_SEGMENTS",
      exhaustive: options.exhaustive !== false,
      deepScanLevel: level
    });
  }

  globalThis.PopupActions = {
    isMissingReceiverError,
    isRestrictedUrl,
    getActiveTab,
    getStorage,
    setStorage,
    buildResultsUrl,
    sendTabMessageWithAutoInject,
    requestSegmentsFromTab
  };
})();
