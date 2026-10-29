import type { ScanScope } from "../../services/renderedText";
import { useEffect, useMemo, useState } from "react";

import { DEFAULT_SETTINGS, usePopupStore } from "../../stores/usePopupStore";
import { parseTopics } from "../../services/filters";
import { normalizePresetHost } from "../../services/presets";
import { getLocal, getSession, removeSession, setLocal, setSession } from "../../chrome/storage";
import { getActiveTab, openTab, runtimeUrl } from "../../chrome/tabs";
import { sendTabMessage } from "../../chrome/messaging";
import { useSpeech } from "./hooks/useSpeech";
import { usePresets } from "./hooks/usePresets";
import { useScan } from "./hooks/useScan";
import { SettingsTab } from "./components/SettingsTab";
import { ArticlesTab } from "./components/ArticlesTab";
import { DetailTab } from "./components/DetailTab";
import { SpeechBar } from "./components/SpeechBar";
import type { ScoredSegment } from "../../services/scan";

const GLOBAL_SETTINGS_KEY = "globalSettings";
const OPENAI_API_KEY = "openaiApiKey";
const TOPIC_OPTIONS_KEY = "topicOptions";
const SCAN_SESSION_KEY_PREFIX = "popupScanState:";

type View = "settings" | "list" | "detail";

interface ScanSessionSnapshot {
  tabId: number;
  scope: ScanScope;
  host: string;
  scan: { total: number; accepted: number };
  segments: ScoredSegment[];
  detailSegmentId: number | null;
  updatedAt: number;
}

function buildResultsUrl(tabId: number | null): string {
  const url = new URL(runtimeUrl("src/entrypoints/results/index.html"));
  if (tabId) {
    url.searchParams.set("tabId", String(tabId));
  }
  return url.toString();
}

export function PopupApp() {
  const {
    settings,
    status,
    scan,
    segments,
    detailSegmentId,
    busy,
    activeHost,
    activeTabId,
    setTopics,
    setThreshold,
    setFilterMode,
    setEmbeddingModel,
    setLocalAiUrl,
    setLocalAiModel,
    setAutoScanEnabled,
    setAutoScanIntervalSec,
    setDeepScanEnabled,
    setDeepScanLevel,
    setDefaultVoice,
    replaceSettings,
    setStatus,
    setBusy,
    setActiveTab,
    setScanSummary,
    setSegments,
    setDetailSegmentId,
  } = usePopupStore();

  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [topicOptions, setTopicOptions] = useState<string[]>([]);
  const [scope, setScope] = useState<ScanScope>("viewport");
  const [view, setView] = useState<View>("settings");
  const [hydrated, setHydrated] = useState(false);

  const domainHost = useMemo(() => normalizePresetHost(activeHost), [activeHost]);
  const topicCount = useMemo(() => parseTopics(settings.topics).length, [settings.topics]);
  const detailSegment = useMemo(
    () => segments.find((segment) => segment.id === detailSegmentId) ?? null,
    [segments, detailSegmentId],
  );

  const speech = useSpeech({
    segments,
    defaultVoice: settings.defaultVoice,
    onStatus: setStatus,
  });

  const presets = usePresets({
    domainHost,
    settings,
    replaceSettings,
    onStatus: setStatus,
  });

  const scanOps = useScan({
    activeTabId,
    scope,
    settings,
    openAiApiKey,
    segments,
    setBusy,
    setStatus,
    setScanSummary,
    setSegments,
    setDetailSegmentId,
  });

  useEffect(() => {
    async function boot(): Promise<void> {
      try {
        const tab = await getActiveTab();
        const host = tab?.url ? new URL(tab.url).hostname : "";
        const tabId = tab?.id ?? null;
        setActiveTab(tabId, host);

        const fromStorage = await getLocal([GLOBAL_SETTINGS_KEY, OPENAI_API_KEY, TOPIC_OPTIONS_KEY]);
        const loaded = (fromStorage[GLOBAL_SETTINGS_KEY] ?? DEFAULT_SETTINGS) as typeof DEFAULT_SETTINGS;
        const rawApiKey = fromStorage[OPENAI_API_KEY];
        const rawTopicOptions = fromStorage[TOPIC_OPTIONS_KEY];
        const apiKeyValue = typeof rawApiKey === "string" ? rawApiKey : "";
        const topicOptionsValue = Array.isArray(rawTopicOptions)
          ? rawTopicOptions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [];
        replaceSettings({ ...DEFAULT_SETTINGS, ...loaded });
        setOpenAiApiKey(apiKeyValue);
        setTopicOptions(topicOptionsValue);

        if (tabId) {
          const sessionKey = `${SCAN_SESSION_KEY_PREFIX}${tabId}`;
          const fromSession = await getSession([sessionKey]);
          const snapshot = fromSession[sessionKey] as ScanSessionSnapshot | undefined;
          const hasSnapshot = snapshot
            && snapshot.tabId === tabId
            && Array.isArray(snapshot.segments)
            && snapshot.host === host
            && (snapshot.scope === "viewport" || snapshot.scope === "page");

          if (hasSnapshot) {
            setScope(snapshot.scope);
            setSegments(snapshot.segments);
            setScanSummary(snapshot.scan ?? { total: snapshot.segments.length, accepted: snapshot.segments.length });
            setDetailSegmentId(snapshot.detailSegmentId ?? null);
            setStatus(`Restored ${snapshot.scan?.accepted ?? snapshot.segments.length} article(s) from a previous scan. Scan again after scrolling.`);
            return;
          }
        }

        setStatus("Ready to scan.");
      } catch {
        setStatus("Cannot read active tab. Open a normal webpage and try again.");
      } finally {
        setHydrated(true);
      }
    }

    void boot();
  }, [replaceSettings, setActiveTab, setStatus]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = globalThis.setTimeout(() => {
      setLocal({
        [GLOBAL_SETTINGS_KEY]: settings,
        [OPENAI_API_KEY]: openAiApiKey,
        [TOPIC_OPTIONS_KEY]: topicOptions,
      }).catch(() => undefined);
    }, 300);

    return () => globalThis.clearTimeout(timer);
  }, [hydrated, settings, openAiApiKey, topicOptions]);

  useEffect(() => {
    if (!hydrated || !activeTabId) {
      return;
    }

    const sessionKey = `${SCAN_SESSION_KEY_PREFIX}${activeTabId}`;
    const timer = globalThis.setTimeout(() => {
      const snapshot: ScanSessionSnapshot = {
        tabId: activeTabId,
        scope,
        host: activeHost,
        scan,
        segments,
        detailSegmentId,
        updatedAt: Date.now(),
      };
      setSession({ [sessionKey]: snapshot }).catch(() => undefined);
    }, 180);

    return () => globalThis.clearTimeout(timer);
  }, [hydrated, activeTabId, activeHost, scope, scan, segments, detailSegmentId]);

  function rememberCurrentTopicsAsOption(): void {
    const normalized = parseTopics(settings.topics).join(", ");
    if (!normalized) {
      setStatus("No topics to save as option.");
      return;
    }
    setTopicOptions((previous) => {
      const deduped = previous.filter((item) => item !== normalized);
      return [normalized, ...deduped].slice(0, 20);
    });
    setStatus("Saved topic option.");
  }

  function toggleTopicChip(topic: string): void {
    const current = parseTopics(settings.topics);
    const already = current.includes(topic);
    const next = already
      ? current.filter((t) => t !== topic)
      : [...current, topic];
    setTopics(next.join(", "));
    setStatus(already ? `Removed topic "${topic}".` : `Added topic "${topic}".`);
  }

  function handleClose(): void {
    if (activeTabId) {
      const sessionKey = `${SCAN_SESSION_KEY_PREFIX}${activeTabId}`;
      removeSession(sessionKey).catch(() => undefined);
    }
    window.close();
  }

  function applyDeepScanPreset(level: number, label: string): void {
    setDeepScanEnabled(true);
    setDeepScanLevel(level);
    setStatus(`Deep scan preset: ${label} (M${level}).`);
  }

  function startCapture(): void {
    if (!activeTabId) {
      setStatus("No active tab available for capture.");
      return;
    }
    const topics = parseTopics(settings.topics);
    if (!topics.length) {
      setStatus("Please provide at least one topic before starting capture.");
      return;
    }
    sendTabMessage(activeTabId, {
        type: "START_CAPTURE",
        tabId: activeTabId,
        topics,
        threshold: settings.threshold,
      })
      .then(() => setStatus("Capture started. Continue browsing on source tab."))
      .catch(() => setStatus("Cannot start capture. Reload source tab and retry."));
  }

  function stopCapture(): void {
    if (!activeTabId) {
      setStatus("No active tab available for capture.");
      return;
    }
    sendTabMessage(activeTabId, { type: "STOP_CAPTURE" })
      .then(() => setStatus("Capture stopped."))
      .catch(() => setStatus("Cannot stop capture on this tab."));
  }

  function handleScanClick(): void {
    scanOps.runScan().catch(() => {
      setStatus("Unexpected error while scanning.");
      setBusy(false);
    });
  }

  function openDetail(segment: ScoredSegment): void {
    setDetailSegmentId(segment.id);
    setView("detail");
    void scanOps.hydrateFullText(segment);
  }

  async function openReaderWindow(): Promise<void> {
    if (!activeTabId) return;
    try {
      const result = await chrome.runtime.sendMessage({ type: "OPEN_READER_WINDOW", tabId: activeTabId });
      if (!result?.ok) throw new Error(result?.error || "Cannot open reader window");
      window.close();
    } catch { setStatus("Cannot open reader window. Try again."); }
  }

  return (
    <main className="popup-root">
      <header className="popup-header">
        <div className="header-row">
          <span className="brand-mark" aria-hidden="true">◖</span><h1>Topic<span>reader</span></h1>
          <span className="host-badge" title={domainHost ?? "no domain"}>{domainHost ?? "—"}</span>
          <button type="button" onClick={() => void openReaderWindow()} className="window-btn" title="Open a separate window to keep reading while browsing" aria-label="Open reader window">↗</button>
          <button type="button" className="close-btn" onClick={handleClose} title="Close and clear session">✕</button>
        </div>
        <nav className="tab-nav" role="tablist">
          <button type="button" role="tab" aria-selected={view === "settings"} className={`tab-btn${view === "settings" ? " active" : ""}`} onClick={() => setView("settings")}>
            Settings
          </button>
          <button type="button" role="tab" aria-selected={view === "list"} className={`tab-btn${view === "list" ? " active" : ""}`} onClick={() => setView("list")}>
            Articles{segments.length > 0 ? <span className="tab-badge">{segments.length}</span> : null}
          </button>
          <button type="button" role="tab" aria-selected={view === "detail"} className={`tab-btn${view === "detail" ? " active" : ""}`} onClick={() => setView("detail")} disabled={detailSegmentId === null}>
            Detail
          </button>
        </nav>
      </header>

      <div className="tab-content">
        {view === "settings" && (
          <SettingsTab
            settings={settings}
            topicCount={topicCount}
            topicOptions={topicOptions}
            openAiApiKey={openAiApiKey}
            domainHost={domainHost}
            onTopicsChange={setTopics}
            onThresholdChange={setThreshold}
            onFilterModeChange={setFilterMode}
            onEmbeddingModelChange={setEmbeddingModel}
            onLocalAiUrlChange={setLocalAiUrl}
            onLocalAiModelChange={setLocalAiModel}
            onOpenAiApiKeyChange={setOpenAiApiKey}
            onAutoScanEnabledChange={setAutoScanEnabled}
            onAutoScanIntervalChange={setAutoScanIntervalSec}
            onDeepScanEnabledChange={setDeepScanEnabled}
            onDeepScanLevelChange={setDeepScanLevel}
            onSaveTopicOption={rememberCurrentTopicsAsOption}
            onToggleTopicChip={toggleTopicChip}
            onApplyDeepScanPreset={applyDeepScanPreset}
            onSavePreset={presets.savePreset}
            onLoadPreset={presets.loadPreset}
            onResetPreset={presets.resetPreset}
            onResetToGlobal={presets.resetToGlobal}
            onStartCapture={startCapture}
            onStopCapture={stopCapture}
            onOpenResults={() => openTab(buildResultsUrl(activeTabId)).catch(() => undefined)}
          />
        )}

        {view === "list" && (
          <ArticlesTab
            segments={segments}
            scanTotal={scan.total}
            scanAccepted={scan.accepted}
            currentReadingSegmentId={speech.currentReadingSegmentId}
            readingRange={speech.readingRange}
            paused={speech.paused}
            onRefresh={handleScanClick}
            busy={busy}
            onScanWithoutFilter={() => void scanOps.runScanFullPage()}
            onUpdateSegment={scanOps.updateSegment}
            onPlaySingle={speech.playSingle}
            onFocus={scanOps.focusInTab}
            onOpenDetail={openDetail}
          />
        )}

        {view === "detail" && (
          <DetailTab
            detailSegment={detailSegment}
            currentReadingSegmentId={speech.currentReadingSegmentId}
            readingRange={speech.readingRange}
            voiceOptions={speech.voiceOptions}
            onBack={() => setView("list")}
            onHydrate={scanOps.hydrateFullText}
            onFocus={scanOps.focusInTab}
            onPlaySingle={speech.playSingle}
            onUpdateSegment={scanOps.updateSegment}
          />
        )}
      </div>

      <SpeechBar
        scope={scope}
        onScopeChange={(next) => {
          speech.stop();
          setScope(next);
          setSegments([]);
          setScanSummary({ total: 0, accepted: 0 });
          setDetailSegmentId(null);
          setStatus("Scan scope changed. Click Scan to collect text in this area.");
          if (view === "detail") setView("list");
        }}
        busy={busy}
        canPlay={segments.length > 0}
        speaking={speech.speaking}
        paused={speech.paused}
        canNext={speech.canNext}
        onNext={speech.next}
        status={status}
        defaultVoice={settings.defaultVoice}
        voiceOptions={speech.voiceOptions}
        onScan={handleScanClick}
        onPlayAll={speech.playAll}
        onTogglePause={speech.togglePause}
        onStop={speech.stop}
        onVoiceChange={setDefaultVoice}
      />
    </main>
  );
}
