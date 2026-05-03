const tabIdInput = document.getElementById("tabIdInput");
const bindTabBtn = document.getElementById("bindTabBtn");
const refreshBtn = document.getElementById("refreshBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const clearBtn = document.getElementById("clearBtn");
const metaEl = document.getElementById("meta");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const pageSizeSelect = document.getElementById("pageSizeSelect");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageInfoEl = document.getElementById("pageInfo");
const itemsEl = document.getElementById("items");
const itemTemplate = document.getElementById("itemTemplate");

let sourceTabId = null;
let refreshTimer = null;
let allItems = [];
let page = 1;
let pageSize = 50;

init();

async function init() {
  const params = new URLSearchParams(window.location.search);
  sourceTabId = Number(params.get("tabId")) || null;

  if (!sourceTabId) {
    const last = await findLastCaptureTabId();
    sourceTabId = last;
  }

  tabIdInput.value = sourceTabId ? String(sourceTabId) : "";
  bindEvents();
  await refreshView();

  refreshTimer = setInterval(() => {
    refreshView().catch(() => {
      // Keep auto refresh running.
    });
  }, 2000);

  window.addEventListener("beforeunload", () => {
    if (refreshTimer) clearInterval(refreshTimer);
  });
}

function bindEvents() {
  bindTabBtn.addEventListener("click", async () => {
    const value = Number(tabIdInput.value);
    if (!value) {
      statusEl.textContent = "Hãy nhập tab id hợp lệ.";
      return;
    }

    sourceTabId = value;
    page = 1;
    await refreshView();
  });

  refreshBtn.addEventListener("click", refreshView);
  startBtn.addEventListener("click", startCapture);
  stopBtn.addEventListener("click", stopCapture);
  clearBtn.addEventListener("click", clearCapture);
  pageSizeSelect.addEventListener("change", () => {
    pageSize = Number(pageSizeSelect.value) || 50;
    page = 1;
    renderCurrentPage();
  });
  prevPageBtn.addEventListener("click", () => {
    page = Math.max(1, page - 1);
    renderCurrentPage();
  });
  nextPageBtn.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
    page = Math.min(totalPages, page + 1);
    renderCurrentPage();
  });
}

function storageKey() {
  return sourceTabId ? `captureResults_${sourceTabId}` : null;
}

async function findLastCaptureTabId() {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all)
    .filter(([key, value]) => key.startsWith("captureResults_") && value?.updatedAt)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt);

  if (!entries.length) return null;
  const key = entries[0][0];
  return Number(key.replace("captureResults_", "")) || null;
}

async function getCaptureData() {
  const key = storageKey();
  if (!key) return null;

  const data = await chrome.storage.local.get([key]);
  return data[key] || null;
}

function isMissingReceiverError(error) {
  const msg = String(error?.message || error || "");
  return msg.includes("Receiving end does not exist") || msg.includes("Could not establish connection");
}

async function sendTabMessageWithAutoInject(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!isMissingReceiverError(error)) throw error;

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });

    return await chrome.tabs.sendMessage(tabId, message);
  }
}

async function refreshView() {
  if (!sourceTabId) {
    metaEl.textContent = "Nguồn: chưa chọn";
    statusEl.textContent = "Chưa có tab nguồn.";
    statsEl.textContent = "";
    allItems = [];
    page = 1;
    pageInfoEl.textContent = "Trang 1/1";
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;
    itemsEl.innerHTML = "";
    return;
  }

  const data = await getCaptureData();
  metaEl.textContent = `Nguồn tab #${sourceTabId}${data?.domain ? ` (${data.domain})` : ""}`;

  if (!data) {
    statusEl.textContent = "Chưa có dữ liệu. Bấm 'Bật theo dõi' rồi quay về tab nguồn để lướt feed.";
    statsEl.textContent = "";
    allItems = [];
    page = 1;
    pageInfoEl.textContent = "Trang 1/1";
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;
    itemsEl.innerHTML = "";
    return;
  }

  statusEl.textContent = `Cập nhật: ${new Date(data.updatedAt).toLocaleString()}`;
  statsEl.textContent = `Tổng đoạn lưu: ${data.count || 0} | Topic: ${(data.topics || []).join(", ")} | Ngưỡng: ${data.threshold}`;
  allItems = data.items || [];
  const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
  if (page > totalPages) page = totalPages;
  renderCurrentPage();
}

function renderCurrentPage() {
  const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
  page = Math.min(Math.max(1, page), totalPages);
  pageInfoEl.textContent = `Trang ${page}/${totalPages}`;
  prevPageBtn.disabled = page <= 1;
  nextPageBtn.disabled = page >= totalPages;

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = allItems.slice(start, end);
  renderItems(pageItems);
}

function renderItems(items) {
  itemsEl.innerHTML = "";

  for (const item of items) {
    const fragment = itemTemplate.content.cloneNode(true);
    const scoreEl = fragment.querySelector(".score");
    const timeEl = fragment.querySelector(".time");
    const keywordsEl = fragment.querySelector(".keywords");
    const textEl = fragment.querySelector(".text");
    const gotoBtn = fragment.querySelector(".goto");

    scoreEl.textContent = `Độ liên quan: ${Math.round((item.score || 0) * 100)}%`;
    timeEl.textContent = `seen: ${new Date(item.lastSeenAt || item.firstSeenAt || Date.now()).toLocaleTimeString()}`;
    keywordsEl.textContent = item.matchedKeywords?.length
      ? `Từ khóa trúng: ${item.matchedKeywords.join(", ")}`
      : "Từ khóa trúng: -";
    textEl.textContent = item.text || "";

    gotoBtn.addEventListener("click", async () => {
      if (!sourceTabId || !item.xpath) return;

      try {
        await chrome.tabs.update(sourceTabId, { active: true });
        await sendTabMessageWithAutoInject(sourceTabId, {
          type: "HIGHLIGHT_SEGMENT",
          xpath: item.xpath
        });
      } catch (error) {
        statusEl.textContent = `Không nhảy tới đoạn được: ${error.message}`;
      }
    });

    itemsEl.append(fragment);
  }
}

async function startCapture() {
  if (!sourceTabId) {
    statusEl.textContent = "Chưa có tab nguồn để theo dõi.";
    return;
  }

  const store = await chrome.storage.local.get(["globalSettings"]);
  const settings = store.globalSettings || {};
  const topics = String(settings.topics || "")
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (!topics.length) {
    statusEl.textContent = "Chưa có topic trong cấu hình. Hãy vào popup để nhập topic trước.";
    return;
  }

  try {
    await sendTabMessageWithAutoInject(sourceTabId, {
      type: "START_CAPTURE",
      tabId: sourceTabId,
      topics,
      threshold: Number(settings.threshold) || 0.35
    });
    statusEl.textContent = "Đã bật theo dõi. Hãy quay lại tab nguồn và lướt feed.";
  } catch (error) {
    statusEl.textContent = `Không bật theo dõi được: ${error.message}`;
  }
}

async function stopCapture() {
  if (!sourceTabId) return;

  try {
    await sendTabMessageWithAutoInject(sourceTabId, { type: "STOP_CAPTURE" });
    statusEl.textContent = "Đã dừng theo dõi.";
  } catch (error) {
    statusEl.textContent = `Không dừng được: ${error.message}`;
  }
}

async function clearCapture() {
  const key = storageKey();
  if (!key) return;

  await chrome.storage.local.remove([key]);
  statusEl.textContent = "Đã xóa dữ liệu lưu trữ của tab nguồn.";
  await refreshView();
}
