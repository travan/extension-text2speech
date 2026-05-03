const {
  topicsInput,
  thresholdInput,
  thresholdValue,
  filterModeInput,
  topicPresetInput,
  apiKeyInput,
  embeddingModelInput,
  defaultVoiceInput,
  aiAdvancedBox,
  autoScanEnabledInput,
  autoScanIntervalInput,
  autoScanIntervalValue,
  deepScanEnabledInput,
  deepScanLevelInput,
  deepScanLevelValue,
  scanPresetFastBtn,
  scanPresetBalancedBtn,
  scanPresetDeepBtn,
  domainInfo,
  configView,
  resultsView,
  scanBtn,
  showResultsBtn,
  backConfigBtn,
  scanInResultsBtn,
  refreshResultsBtn,
  stopInResultsBtn,
  playBtn,
  stopBtn,
  startCaptureBtn,
  stopCaptureBtn,
  openResultsBtn,
  savePresetBtn,
  reloadPresetBtn,
  statusEl,
  resultsMetaEl,
  popupPageSizeSelect,
  popupPrevBtn,
  popupNextBtn,
  popupPageInfo,
  detailPanel,
  detailMeta,
  detailText,
  detailReadBtn,
  detailFocusBtn,
  detailCloseBtn,
  segmentsEl,
  segmentTemplate
} = globalThis.PopupDom;

const {
  parseTopics,
  normalizeWhitespace,
  expandTopicCandidates,
  lexicalTopicScore,
  getMatchedKeywords,
  normalizeLexicalScore,
  hostFromUrl
} = globalThis.PopupFilters;

const {
  buildRawSignature,
  applySemanticScores
} = globalThis.PopupScan;

const {
  processScanResult
} = globalThis.PopupScanActions;

const {
  isRestrictedUrl,
  getActiveTab,
  getStorage,
  setStorage,
  buildResultsUrl,
  sendTabMessageWithAutoInject,
  requestSegmentsFromTab
} = globalThis.PopupActions;

const {
  getFreeVietnameseVoice: speechGetFreeVietnameseVoice,
  getVoiceByName: speechGetVoiceByName,
  buildVoiceOptions: speechBuildVoiceOptions
} = globalThis.PopupSpeech;

const {
  buildDetailMetaText,
  renderSegmentsView
} = globalThis.PopupView;

const STORAGE_KEYS = {
  domainPresets: "domainPresets",
  globalSettings: "globalSettings",
  openaiApiKey: "openaiApiKey"
};

const DEFAULTS = {
  topics: "",
  threshold: 0.45,
  filterMode: "basic",
  embeddingModel: "text-embedding-3-small",
  defaultVoice: "",
  autoScanEnabled: false,
  autoScanIntervalSec: 4,
  deepScanEnabled: true,
  deepScanLevel: 3
};

const FREE_VI_VOICE_VALUE = "__vi_free_auto__";

let voices = [];
let segments = [];
let utteranceQueue = [];
let speaking = false;
let paused = false;
let currentHost = null;
let currentTabId = null;
let autoScanTimer = null;
let isScanning = false;
let lastRawSignature = null;
let popupResultsPage = 1;
let popupResultsPageSize = 10;
let settingsSaveTimer = null;
let currentDetailSegment = null;
let currentReadingSegmentKey = null;

await init();

async function init() {
  loadVoices();
  globalThis.speechSynthesis.onvoiceschanged = () => {
    loadVoices();
    rebuildVoiceInputs();
  };

  const tab = await getActiveTab();
  currentTabId = tab?.id || null;
  currentHost = hostFromUrl(tab?.url);
  domainInfo.textContent = `Domain: ${currentHost || "không xác định"}`;

  await loadSettingsForCurrentHost();
  bindEvents();
  popupResultsPageSize = Number(popupPageSizeSelect.value) || 10;
  updateAdvancedVisibility();
  updateAutoScanState();
  window.addEventListener("beforeunload", stopAutoScan);
}

function bindEvents() {
  thresholdInput.addEventListener("input", () => {
    thresholdValue.textContent = thresholdInput.value;
  });
  filterModeInput.addEventListener("change", () => {
    updateAdvancedVisibility();
  });
  topicPresetInput.addEventListener("change", () => {
    if (topicPresetInput.value) {
      topicsInput.value = topicPresetInput.value;
    }
    scheduleSettingsSave();
  });
  topicsInput.addEventListener("input", scheduleSettingsSave);
  thresholdInput.addEventListener("change", scheduleSettingsSave);
  filterModeInput.addEventListener("change", scheduleSettingsSave);
  embeddingModelInput.addEventListener("change", scheduleSettingsSave);
  apiKeyInput.addEventListener("change", scheduleSettingsSave);
  autoScanEnabledInput.addEventListener("change", scheduleSettingsSave);
  autoScanIntervalInput.addEventListener("change", scheduleSettingsSave);
  deepScanEnabledInput.addEventListener("change", () => {
    scheduleSettingsSave();
    syncDeepScanPresetButtons();
  });
  deepScanLevelInput.addEventListener("input", () => {
    deepScanLevelValue.textContent = deepScanLevelInput.value;
    syncDeepScanPresetButtons();
  });
  deepScanLevelInput.addEventListener("change", scheduleSettingsSave);
  scanPresetFastBtn.addEventListener("click", () => {
    applyDeepScanPreset(2, "Nhanh");
  });
  scanPresetBalancedBtn.addEventListener("click", () => {
    applyDeepScanPreset(3, "Cân bằng");
  });
  scanPresetDeepBtn.addEventListener("click", () => {
    applyDeepScanPreset(5, "Rất sâu");
  });

  scanBtn.addEventListener("click", scanCurrentTab);
  showResultsBtn.addEventListener("click", async () => {
    await loadResultsFromCaptureStorage();
    switchToResultsView();
  });
  backConfigBtn.addEventListener("click", () => {
    switchToConfigView();
  });
  scanInResultsBtn.addEventListener("click", async () => {
    await scanCurrentTab({ source: "manual" });
  });
  refreshResultsBtn.addEventListener("click", async () => {
    await loadResultsFromCaptureStorage();
    renderSegments(segments);
  });
  stopInResultsBtn.addEventListener("click", stopPlayback);
  playBtn.addEventListener("click", playSelectedSegments);
  stopBtn.addEventListener("click", stopPlayback);
  startCaptureBtn.addEventListener("click", startFeedCapture);
  stopCaptureBtn.addEventListener("click", stopFeedCapture);
  openResultsBtn.addEventListener("click", openResultsForCurrentTab);
  savePresetBtn.addEventListener("click", saveDomainPreset);
  reloadPresetBtn.addEventListener("click", loadSettingsForCurrentHost);
  defaultVoiceInput.addEventListener("change", () => {
    defaultVoiceInput.dataset.preferred = defaultVoiceInput.value;
    scheduleSettingsSave();
  });
  autoScanIntervalInput.addEventListener("input", () => {
    autoScanIntervalValue.textContent = autoScanIntervalInput.value;
  });
  autoScanEnabledInput.addEventListener("change", () => {
    updateAutoScanState();
  });
  autoScanIntervalInput.addEventListener("change", () => {
    updateAutoScanState();
  });
  popupPageSizeSelect.addEventListener("change", () => {
    popupResultsPageSize = Number(popupPageSizeSelect.value) || 10;
    popupResultsPage = 1;
    renderSegments(segments);
  });
  popupPrevBtn.addEventListener("click", () => {
    popupResultsPage = Math.max(1, popupResultsPage - 1);
    renderSegments(segments);
  });
  popupNextBtn.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(segments.length / popupResultsPageSize));
    popupResultsPage = Math.min(totalPages, popupResultsPage + 1);
    renderSegments(segments);
  });
  detailReadBtn.addEventListener("click", async () => {
    if (!currentDetailSegment) return;
    await hydrateFullTextForSegment(currentDetailSegment);
    playSingleSegment(currentDetailSegment);
  });
  detailFocusBtn.addEventListener("click", () => {
    if (currentDetailSegment) focusSegmentInThread(currentDetailSegment);
  });
  detailCloseBtn.addEventListener("click", () => {
    hideDetailPanel();
  });
}

function switchToResultsView() {
  configView.hidden = true;
  resultsView.hidden = false;
  renderSegments(segments);
}

function switchToConfigView() {
  hideDetailPanel();
  resultsView.hidden = true;
  configView.hidden = false;
}

function showDetailPanel(segment) {
  currentDetailSegment = segment;
  detailPanel.hidden = false;
  detailMeta.textContent = buildDetailMetaText(segment);
  detailText.textContent = segment.text || "";
}

function hideDetailPanel() {
  detailPanel.hidden = true;
  currentDetailSegment = null;
}

function applyDeepScanPreset(level, label) {
  const nextLevel = Math.min(5, Math.max(1, Number(level) || DEFAULTS.deepScanLevel));
  deepScanEnabledInput.checked = true;
  deepScanLevelInput.value = String(nextLevel);
  deepScanLevelValue.textContent = deepScanLevelInput.value;
  syncDeepScanPresetButtons();
  scheduleSettingsSave();
  statusEl.textContent = `Đã chọn preset scan: ${label} (M${nextLevel}).`;
}

function getActiveDeepScanPreset() {
  if (!deepScanEnabledInput.checked) return "";
  const level = Math.min(5, Math.max(1, Number(deepScanLevelInput.value) || DEFAULTS.deepScanLevel));
  if (level <= 2) return "fast";
  if (level >= 5) return "deep";
  return "balanced";
}

function syncDeepScanPresetButtons() {
  const activePreset = getActiveDeepScanPreset();
  const buttonMap = {
    fast: scanPresetFastBtn,
    balanced: scanPresetBalancedBtn,
    deep: scanPresetDeepBtn
  };

  for (const [key, button] of Object.entries(buttonMap)) {
    if (!button) continue;
    const active = key === activePreset;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function getSegmentKey(segment) {
  if (!segment) return "";
  return segment.xpath || `id:${segment.id}`;
}

function syncReadingIndicators() {
  const cards = segmentsEl.querySelectorAll(".segment-item");
  for (const card of cards) {
    const isReading = Boolean(currentReadingSegmentKey) && card.dataset.segmentKey === currentReadingSegmentKey;
    card.classList.toggle("is-reading", isReading);
  }
}

function syncPauseButtons() {
  const label = paused ? "Tiếp tục" : "Tạm dừng";
  const disabled = !speaking;
  const buttons = segmentsEl.querySelectorAll(".pause-toggle-btn");
  for (const button of buttons) {
    button.textContent = label;
    button.disabled = disabled;
  }
}

function togglePauseResume() {
  if (!speaking) return;
  if (paused) {
    resumePlayback();
  } else {
    pausePlayback();
  }
}

async function rescanAndReadFromSegment(segment) {
  if (!segment) return;

  await scanCurrentTab({ source: "manual" });
  const refreshed = segments.find((item) => item.xpath === segment.xpath)
    || segments.find((item) => normalizeWhitespace(item.text) === normalizeWhitespace(segment.text));

  if (!refreshed) {
    statusEl.textContent = "Đã quét lại nhưng không còn thấy item cũ trong kết quả lọc.";
    return;
  }

  await hydrateFullTextForSegment(refreshed);
  showDetailPanel(refreshed);
  await focusSegmentInThread(refreshed);
  playSingleSegment(refreshed);
}

async function requestFullTextForSegment(segment) {
  if (!currentTabId || !segment?.xpath) return null;

  try {
    const tab = await chrome.tabs.get(currentTabId);
    if (!tab?.id) return null;

    const response = await sendTabMessageWithAutoInject(tab, {
      type: "GET_FULL_SEGMENT_TEXT",
      xpath: segment.xpath
    });

    if (!response?.ok || !response?.text) return null;
    return String(response.text);
  } catch (error) {
    console.debug("GET_FULL_SEGMENT_TEXT failed", error);
    return null;
  }
}

async function hydrateFullTextForSegment(segment) {
  if (!segment?.xpath) return;
  const fullText = await requestFullTextForSegment(segment);
  if (!fullText || fullText.length <= (segment.text || "").length) return;

  segment.text = fullText;
  if (currentDetailSegment && getSegmentKey(currentDetailSegment) === getSegmentKey(segment)) {
    detailText.textContent = segment.text;
  }
}

async function focusSegmentInThread(segment) {
  if (!currentTabId || !segment?.xpath) return;
  try {
    await chrome.tabs.sendMessage(currentTabId, {
      type: "HIGHLIGHT_SEGMENT",
      xpath: segment.xpath
    });
  } catch (error) {
    console.debug("HIGHLIGHT_SEGMENT failed", error);
  }
  await chrome.tabs.update(currentTabId, { active: true });
}

function scheduleSettingsSave() {
  if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => {
    persistSettingsDraft().catch(() => {
      // Best effort autosave.
    });
  }, 350);
}

async function persistSettingsDraft() {
  const settings = readSettingsFromUi();
  const apiKey = apiKeyInput.value.trim();
  const updates = {
    [STORAGE_KEYS.globalSettings]: settings,
    [STORAGE_KEYS.openaiApiKey]: apiKey
  };

  if (currentHost) {
    const store = await getStorage([STORAGE_KEYS.domainPresets]);
    const domainPresets = store[STORAGE_KEYS.domainPresets] || {};
    domainPresets[currentHost] = settings;
    updates[STORAGE_KEYS.domainPresets] = domainPresets;
  }

  await setStorage(updates);
}

async function loadResultsFromCaptureStorage() {
  if (!currentTabId) return;
  const key = `captureResults_${currentTabId}`;
  const data = await chrome.storage.local.get([key]);
  const payload = data[key];
  const items = payload?.items;
  if (!Array.isArray(items) || !items.length) return;

  segments = items.map((item, index) => ({
    id: item.id ?? index,
    text: item.text || "",
    xpath: item.xpath || "",
    score: Number(item.score || 0),
    lexicalScore: Number(item.score || 0),
    semanticScore: null,
    matchedKeywords: item.matchedKeywords || [],
    matchedTopics: [],
    selected: true,
    voice: ""
  }));
}

function updateAdvancedVisibility() {
  const isAiMode = filterModeInput.value === "ai";
  aiAdvancedBox.open = isAiMode;
}

function updateAutoScanState() {
  if (!autoScanEnabledInput.checked) {
    stopAutoScan();
    return;
  }

  startAutoScan();
}

function startAutoScan() {
  stopAutoScan();
  const intervalMs = Math.max(2, Number(autoScanIntervalInput.value) || 4) * 1000;
  autoScanTimer = setInterval(() => {
    scanCurrentTab({ silent: true, source: "auto" }).catch(() => {
      // Silent auto-scan; manual scan shows full errors.
    });
  }, intervalMs);
}

function stopAutoScan() {
  if (!autoScanTimer) return;
  clearInterval(autoScanTimer);
  autoScanTimer = null;
}

function rebuildVoiceInputs() {
  const preferred = defaultVoiceInput.dataset.preferred || defaultVoiceInput.value;
  buildVoiceOptions(defaultVoiceInput, preferred);
}

function loadVoices() {
  voices = speechSynthesis.getVoices();
}

async function openResultsForCurrentTab() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    statusEl.textContent = "Không tìm thấy tab để mở trang kết quả.";
    return;
  }

  await chrome.tabs.create({ url: buildResultsUrl(tab.id) });
}

async function startFeedCapture() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    statusEl.textContent = "Không tìm thấy tab đang mở.";
    return;
  }
  if (isRestrictedUrl(tab.url)) {
    statusEl.textContent = "Trang này không hỗ trợ theo dõi feed.";
    return;
  }

  const settings = readSettingsFromUi();
  const topics = parseTopics(settings.topics);
  if (!topics.length) {
    statusEl.textContent = "Hãy nhập ít nhất 1 topic trước khi theo dõi feed.";
    return;
  }
  await setStorage({
    [STORAGE_KEYS.globalSettings]: settings,
    [STORAGE_KEYS.openaiApiKey]: apiKeyInput.value.trim()
  });

  try {
    await sendTabMessageWithAutoInject(tab, {
      type: "START_CAPTURE",
      tabId: tab.id,
      topics,
      threshold: settings.threshold
    });
    statusEl.textContent = "Đã bật theo dõi feed. Hãy lướt tab nguồn, rồi mở trang kết quả để xem.";
  } catch (error) {
    statusEl.textContent = `Không bật được theo dõi feed: ${error.message}`;
    return;
  }

  await chrome.tabs.create({ url: buildResultsUrl(tab.id) });
}

async function stopFeedCapture() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    statusEl.textContent = "Không tìm thấy tab đang mở.";
    return;
  }

  try {
    await sendTabMessageWithAutoInject(tab, { type: "STOP_CAPTURE" });
    statusEl.textContent = "Đã dừng theo dõi feed.";
  } catch (error) {
    statusEl.textContent = `Không dừng được theo dõi feed: ${error.message}`;
  }
}

function normalizeSettings(raw = {}) {
  const filterMode = raw.filterMode || (raw.semanticEnabled ? "ai" : DEFAULTS.filterMode);
  return {
    topics: raw.topics ?? DEFAULTS.topics,
    threshold: Number(raw.threshold ?? DEFAULTS.threshold),
    filterMode,
    embeddingModel: raw.embeddingModel ?? DEFAULTS.embeddingModel,
    defaultVoice: raw.defaultVoice ?? DEFAULTS.defaultVoice,
    autoScanEnabled: Boolean(raw.autoScanEnabled ?? DEFAULTS.autoScanEnabled),
    autoScanIntervalSec: Math.max(2, Number(raw.autoScanIntervalSec ?? DEFAULTS.autoScanIntervalSec)),
    deepScanEnabled: Boolean(raw.deepScanEnabled ?? DEFAULTS.deepScanEnabled),
    deepScanLevel: Math.min(5, Math.max(1, Number(raw.deepScanLevel ?? DEFAULTS.deepScanLevel) || DEFAULTS.deepScanLevel))
  };
}

function applySettingsToUi(settings, apiKey) {
  topicsInput.value = settings.topics ?? DEFAULTS.topics;
  thresholdInput.value = String(settings.threshold ?? DEFAULTS.threshold);
  thresholdValue.textContent = thresholdInput.value;
  filterModeInput.value = settings.filterMode ?? DEFAULTS.filterMode;
  embeddingModelInput.value = settings.embeddingModel ?? DEFAULTS.embeddingModel;
  apiKeyInput.value = apiKey || "";
  defaultVoiceInput.dataset.preferred = settings.defaultVoice ?? DEFAULTS.defaultVoice;
  autoScanEnabledInput.checked = Boolean(settings.autoScanEnabled ?? DEFAULTS.autoScanEnabled);
  autoScanIntervalInput.value = String(settings.autoScanIntervalSec ?? DEFAULTS.autoScanIntervalSec);
  autoScanIntervalValue.textContent = autoScanIntervalInput.value;
  deepScanEnabledInput.checked = Boolean(settings.deepScanEnabled ?? DEFAULTS.deepScanEnabled);
  deepScanLevelInput.value = String(settings.deepScanLevel ?? DEFAULTS.deepScanLevel);
  deepScanLevelValue.textContent = deepScanLevelInput.value;
  syncDeepScanPresetButtons();

  buildVoiceOptions(defaultVoiceInput, settings.defaultVoice ?? DEFAULTS.defaultVoice);
  if (!settings.defaultVoice && getFreeVietnameseVoice()) {
    defaultVoiceInput.value = FREE_VI_VOICE_VALUE;
  }
}

function readSettingsFromUi() {
  return {
    topics: topicsInput.value,
    threshold: Number(thresholdInput.value),
    filterMode: filterModeInput.value || DEFAULTS.filterMode,
    embeddingModel: embeddingModelInput.value.trim() || DEFAULTS.embeddingModel,
    defaultVoice: defaultVoiceInput.value || "",
    autoScanEnabled: autoScanEnabledInput.checked,
    autoScanIntervalSec: Math.max(2, Number(autoScanIntervalInput.value) || DEFAULTS.autoScanIntervalSec),
    deepScanEnabled: deepScanEnabledInput.checked,
    deepScanLevel: Math.min(5, Math.max(1, Number(deepScanLevelInput.value) || DEFAULTS.deepScanLevel))
  };
}

async function loadSettingsForCurrentHost() {
  const store = await getStorage([
    STORAGE_KEYS.domainPresets,
    STORAGE_KEYS.globalSettings,
    STORAGE_KEYS.openaiApiKey
  ]);

  const globalSettings = normalizeSettings(store[STORAGE_KEYS.globalSettings] || {});
  const domainPresets = store[STORAGE_KEYS.domainPresets] || {};
  const domainSettings = currentHost ? normalizeSettings(domainPresets[currentHost] || {}) : null;

  const merged = domainSettings ? { ...globalSettings, ...domainSettings } : globalSettings;
  applySettingsToUi(merged, store[STORAGE_KEYS.openaiApiKey] || "");
  updateAdvancedVisibility();
  updateAutoScanState();

  const mode = domainSettings ? "preset domain" : "preset global";
  statusEl.textContent = `Đã nạp ${mode}.`;
}

async function saveDomainPreset() {
  const ui = readSettingsFromUi();
  const apiKey = apiKeyInput.value.trim();

  const updates = {
    [STORAGE_KEYS.globalSettings]: ui,
    [STORAGE_KEYS.openaiApiKey]: apiKey
  };

  if (currentHost) {
    const store = await getStorage([STORAGE_KEYS.domainPresets]);
    const domainPresets = store[STORAGE_KEYS.domainPresets] || {};
    domainPresets[currentHost] = ui;
    updates[STORAGE_KEYS.domainPresets] = domainPresets;

    await setStorage(updates);
    statusEl.textContent = `Đã lưu preset cho ${currentHost}.`;
    return;
  }

  await setStorage(updates);
  statusEl.textContent = "Đã lưu preset global (không xác định domain).";
}

async function prepareActiveTabForScan(silent) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    if (!silent) statusEl.textContent = "Không tìm thấy tab đang mở.";
    return null;
  }
  if (isRestrictedUrl(tab.url)) {
    if (!silent) statusEl.textContent = "Trang này không cho inject extension (chrome://, extension page...).";
    return null;
  }

  currentTabId = tab.id;
  currentHost = hostFromUrl(tab.url);
  domainInfo.textContent = `Domain: ${currentHost || "không xác định"}`;
  return tab;
}

async function extractSegmentsFromTab(tab, settings, options, source, silent) {
  const exhaustiveScan = options.exhaustive ?? settings.deepScanEnabled;
  const deepScanLevel = Math.min(5, Math.max(1, Number(settings.deepScanLevel) || DEFAULTS.deepScanLevel));

  if (!silent) {
    const scanLabel = exhaustiveScan ? `scan sâu M${deepScanLevel}` : "scan nhanh";
    statusEl.textContent = source === "auto"
      ? `Auto-scan đang quét (${scanLabel})...`
      : `Đang quét nội dung trang (${scanLabel})...`;
  }

  try {
    return await requestSegmentsFromTab(tab, {
      exhaustive: exhaustiveScan,
      deepScanLevel
    });
  } catch (error) {
    if (!silent) statusEl.textContent = `Không inject được content script: ${error.message}. Hãy thử reload tab rồi quét lại.`;
    return null;
  }
}

async function scanCurrentTab(options = {}) {
  const silent = Boolean(options.silent);
  const source = options.source || "manual";
  if (isScanning) return;
  isScanning = true;

  try {
    const tab = await prepareActiveTabForScan(silent);
    if (!tab) return;

    const settings = readSettingsFromUi();
    const apiKey = apiKeyInput.value.trim();
    const topics = parseTopics(settings.topics);
    const topicCandidates = expandTopicCandidates(topics);
    const useAiMode = settings.filterMode === "ai";

    await persistSettingsDraft();

    const response = await extractSegmentsFromTab(tab, settings, options, source, silent);
    if (!response) return;

    if (!response?.ok) {
      if (!silent) statusEl.textContent = "Không đọc được nội dung trang này.";
      return;
    }

    const rawSegments = Array.isArray(response.segments) ? response.segments : [];
    const rawSignature = buildRawSignature(rawSegments);
    if (source === "auto" && rawSignature === lastRawSignature) {
      return;
    }

    const processed = await processScanResult({
      rawSegments,
      previousSegments: segments,
      topics,
      topicCandidates,
      settings,
      apiKey,
      useAiMode,
      status: {
        setText: (text) => {
          statusEl.textContent = text;
        }
      },
      fns: {
        lexicalTopicScore,
        normalizeLexicalScore,
        getMatchedKeywords,
        applySemanticScores
      }
    });

    segments = processed.segments;
    lastRawSignature = rawSignature;
    popupResultsPage = 1;
    renderSegments(segments);

    playBtn.disabled = segments.length === 0;
    stopBtn.disabled = true;

    statusEl.textContent = `Đã quét ${response.total} đoạn, giữ ${segments.length} đoạn phù hợp.${processed.fallbackNote}`;
    if (source !== "auto") {
      switchToResultsView();
    }
  } finally {
    isScanning = false;
  }
}

function buildVoiceOptions(selectEl, selectedValue) {
  speechBuildVoiceOptions(selectEl, voices, selectedValue, FREE_VI_VOICE_VALUE);
}

function renderSegments(items) {
  const result = renderSegmentsView({
    items,
    pagination: {
      page: popupResultsPage,
      pageSize: popupResultsPageSize
    },
    elements: {
      segmentsEl,
      popupPageInfo,
      popupPrevBtn,
      popupNextBtn,
      resultsMetaEl,
      segmentTemplate
    },
    helpers: {
      parseTopics,
      getTopicsText: () => topicsInput.value,
      getThresholdText: () => thresholdInput.value,
      getFilterMode: () => filterModeInput.value,
      getDefaultVoice: () => defaultVoiceInput.value,
      getSegmentKey,
      buildVoiceOptions
    },
    handlers: {
      hideDetailPanel,
      showDetailPanel,
      hydrateFullTextForSegment,
      focusSegmentInThread,
      playSingleSegment,
      togglePauseResume,
      rescanAndReadFromSegment,
      syncPauseButtons,
      syncReadingIndicators
    },
    state: {
      paused,
      speaking
    }
  });

  popupResultsPage = result.page;
}

function getVoiceByName(name) {
  return speechGetVoiceByName(voices, name, FREE_VI_VOICE_VALUE);
}

function getFreeVietnameseVoice() {
  const currentVoices = speechSynthesis.getVoices();
  if (currentVoices.length) voices = currentVoices;
  return speechGetFreeVietnameseVoice(voices);
}

function queueSpeech(text, voiceName, segmentKey) {
  const utterance = new SpeechSynthesisUtterance(text);
  const pickedVoiceName = voiceName || defaultVoiceInput.value;
  const voice = getVoiceByName(pickedVoiceName);
  if (voice) utterance.voice = voice;
  if (pickedVoiceName === FREE_VI_VOICE_VALUE) {
    utterance.lang = "vi-VN";
  }

  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.segmentKey = segmentKey || "";

  utteranceQueue.push(utterance);
}

function playQueue() {
  if (!utteranceQueue.length) {
    speaking = false;
    paused = false;
    currentReadingSegmentKey = null;
    stopBtn.disabled = true;
    playBtn.disabled = segments.length === 0;
    statusEl.textContent = "Đọc xong các đoạn đã chọn.";
    syncPauseButtons();
    syncReadingIndicators();
    return;
  }

  speaking = true;
  paused = false;
  syncPauseButtons();
  const current = utteranceQueue.shift();
  currentReadingSegmentKey = current.segmentKey || null;
  syncReadingIndicators();
  current.onend = playQueue;
  current.onerror = playQueue;
  speechSynthesis.speak(current);
}

function playSelectedSegments() {
  if (speaking) return;

  const picked = segments.filter((segment) => segment.selected);
  if (!picked.length) {
    statusEl.textContent = "Hãy chọn ít nhất 1 đoạn để đọc.";
    return;
  }

  utteranceQueue = [];
  for (const segment of picked) {
    queueSpeech(segment.text, segment.voice, getSegmentKey(segment));
  }

  playBtn.disabled = true;
  stopBtn.disabled = false;
  statusEl.textContent = `Đang đọc ${picked.length} đoạn theo topic...`;
  playQueue();
  syncPauseButtons();
}

function playSingleSegment(segment) {
  if (!segment?.text) return;
  stopPlayback();
  utteranceQueue = [];
  queueSpeech(segment.text, segment.voice, getSegmentKey(segment));
  playBtn.disabled = true;
  stopBtn.disabled = false;
  statusEl.textContent = "Đang đọc item đã chọn.";
  playQueue();
  syncPauseButtons();
}

function stopPlayback() {
  speechSynthesis.cancel();
  utteranceQueue = [];
  speaking = false;
  paused = false;
  currentReadingSegmentKey = null;
  stopBtn.disabled = true;
  playBtn.disabled = segments.length === 0;
  statusEl.textContent = "Đã dừng.";
  syncPauseButtons();
  syncReadingIndicators();
}

function pausePlayback() {
  if (!speaking) return;
  speechSynthesis.pause();
  paused = true;
  statusEl.textContent = "Đã tạm dừng.";
  syncPauseButtons();
}

function resumePlayback() {
  if (!speaking || !paused) return;
  speechSynthesis.resume();
  paused = false;
  statusEl.textContent = "Tiếp tục đọc.";
  syncPauseButtons();
}
