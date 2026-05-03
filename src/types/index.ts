export type FilterMode = "basic" | "ai";

export interface PopupSettings {
  topics: string;
  threshold: number;
  filterMode: FilterMode;
  embeddingModel: string;
  defaultVoice: string;
  autoScanEnabled: boolean;
  autoScanIntervalSec: number;
  deepScanEnabled: boolean;
  deepScanLevel: number;
}

export interface ScanSummary {
  total: number;
  accepted: number;
}

export interface CaptureRecord {
  key: string;
  id?: number;
  score: number;
  text: string;
  xpath?: string;
  matchedKeywords?: string[];
  firstSeenAt?: number;
  lastSeenAt?: number;
  capturedAt: number;
}
