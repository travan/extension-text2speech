import { create } from "zustand";

import type { FilterMode, PopupSettings, ScanSummary } from "../types";
import type { ScoredSegment } from "../services/scan";
import { DEFAULT_LOCAL_AI_MODEL, DEFAULT_LOCAL_AI_URL } from "../services/localAi";

const DEFAULT_SETTINGS: PopupSettings = {
  topics: "",
  threshold: 0.45,
  filterMode: "basic",
  embeddingModel: "text-embedding-3-small",
  localAiUrl: DEFAULT_LOCAL_AI_URL,
  localAiModel: DEFAULT_LOCAL_AI_MODEL,
  defaultVoice: "",
  autoScanEnabled: false,
  autoScanIntervalSec: 4,
  deepScanEnabled: true,
  deepScanLevel: 3,
};

interface PopupState {
  settings: PopupSettings;
  status: string;
  scan: ScanSummary;
  segments: ScoredSegment[];
  detailSegmentId: number | null;
  busy: boolean;
  activeTabId: number | null;
  activeHost: string;
  setTopics: (topics: string) => void;
  setThreshold: (threshold: number) => void;
  setFilterMode: (mode: FilterMode) => void;
  setEmbeddingModel: (model: string) => void;
  setLocalAiUrl: (url: string) => void;
  setLocalAiModel: (model: string) => void;
  setAutoScanEnabled: (enabled: boolean) => void;
  setAutoScanIntervalSec: (seconds: number) => void;
  setDeepScanEnabled: (enabled: boolean) => void;
  setDeepScanLevel: (level: number) => void;
  setDefaultVoice: (voice: string) => void;
  setStatus: (status: string) => void;
  setBusy: (busy: boolean) => void;
  setActiveTab: (tabId: number | null, host: string) => void;
  setScanSummary: (summary: ScanSummary) => void;
  setSegments: (segments: ScoredSegment[] | ((previous: ScoredSegment[]) => ScoredSegment[])) => void;
  setDetailSegmentId: (segmentId: number | null) => void;
  replaceSettings: (settings: PopupSettings) => void;
}

export const usePopupStore = create<PopupState>((set) => ({
  settings: DEFAULT_SETTINGS,
  status: "Ready.",
  scan: { total: 0, accepted: 0 },
  segments: [],
  detailSegmentId: null,
  busy: false,
  activeTabId: null,
  activeHost: "-",
  setTopics: (topics) => set((state) => ({ settings: { ...state.settings, topics } })),
  setThreshold: (threshold) => set((state) => ({ settings: { ...state.settings, threshold } })),
  setFilterMode: (filterMode) => set((state) => ({ settings: { ...state.settings, filterMode } })),
  setEmbeddingModel: (embeddingModel) => set((state) => ({ settings: { ...state.settings, embeddingModel } })),
  setLocalAiUrl: (localAiUrl) => set((state) => ({ settings: { ...state.settings, localAiUrl } })),
  setLocalAiModel: (localAiModel) => set((state) => ({ settings: { ...state.settings, localAiModel } })),
  setAutoScanEnabled: (autoScanEnabled) => set((state) => ({ settings: { ...state.settings, autoScanEnabled } })),
  setAutoScanIntervalSec: (autoScanIntervalSec) =>
    set((state) => ({ settings: { ...state.settings, autoScanIntervalSec } })),
  setDeepScanEnabled: (deepScanEnabled) => set((state) => ({ settings: { ...state.settings, deepScanEnabled } })),
  setDeepScanLevel: (deepScanLevel) => set((state) => ({ settings: { ...state.settings, deepScanLevel } })),
  setDefaultVoice: (defaultVoice) => set((state) => ({ settings: { ...state.settings, defaultVoice } })),
  setStatus: (status) => set({ status }),
  setBusy: (busy) => set({ busy }),
  setActiveTab: (activeTabId, activeHost) => set({ activeTabId, activeHost }),
  setScanSummary: (scan) => set({ scan }),
  setSegments: (segments) => set((state) => ({
    segments: typeof segments === "function" ? segments(state.segments) : segments,
  })),
  setDetailSegmentId: (detailSegmentId) => set({ detailSegmentId }),
  replaceSettings: (settings) => set({ settings }),
}));

export { DEFAULT_SETTINGS };
