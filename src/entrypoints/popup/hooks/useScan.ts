import { useEffect } from "react";

import { expandTopicCandidates, parseTopics } from "../../../services/filters";
import { buildRawSignature, processScanResult, type RawSegment, type ScoredSegment } from "../../../services/scan";
import { sendTabMessage } from "../../../chrome/messaging";
import { activateTab, reloadTab } from "../../../chrome/tabs";
import type { PopupSettings } from "../../../types";

type ExtractSegmentsResponse = { ok?: boolean; segments?: RawSegment[] };
type FullTextResponse = { ok?: boolean; text?: string };

interface UseScanOptions {
  activeTabId: number | null;
  settings: PopupSettings;
  openAiApiKey: string;
  segments: ScoredSegment[];
  setBusy: (busy: boolean) => void;
  setStatus: (message: string) => void;
  setScanSummary: (summary: { total: number; accepted: number }) => void;
  setSegments: (segments: ScoredSegment[]) => void;
  setDetailSegmentId: (id: number | null) => void;
}

export interface UseScanReturn {
  runScan: (silent?: boolean) => Promise<void>;
  runScanFullPage: () => Promise<void>;
  updateSegment: (id: number, updater: (segment: ScoredSegment) => ScoredSegment) => void;
  hydrateFullText: (segment: ScoredSegment) => Promise<ScoredSegment>;
  focusInTab: (segment: ScoredSegment) => Promise<void>;
}

export function useScan({
  activeTabId,
  settings,
  openAiApiKey,
  segments,
  setBusy,
  setStatus,
  setScanSummary,
  setSegments,
  setDetailSegmentId,
}: UseScanOptions): UseScanReturn {
  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
  }

  useEffect(() => {
    if (!settings.autoScanEnabled || !activeTabId) {
      return;
    }

    const timer = globalThis.setInterval(() => {
      runScan(true).catch(() => undefined);
    }, Math.max(2, settings.autoScanIntervalSec) * 1000);

    return () => globalThis.clearInterval(timer);
  }, [settings.autoScanEnabled, settings.autoScanIntervalSec, activeTabId]);

  async function runScan(silent = false, retryOnMissingReceiver = true): Promise<void> {
    if (!activeTabId) {
      setStatus("No active tab selected.");
      return;
    }

    setBusy(true);
    if (!silent) {
      setStatus("Scanning page...");
    }

    try {
      const response = await sendTabMessage<ExtractSegmentsResponse>(activeTabId, {
        type: "EXTRACT_SEGMENTS",
        exhaustive: settings.deepScanEnabled,
        deepScanLevel: settings.deepScanLevel,
      });

      const rawSegments = Array.isArray(response?.segments) ? response.segments : [];
      const topics = parseTopics(settings.topics);
      const topicCandidates = expandTopicCandidates(topics);
      const rawSignature = buildRawSignature(rawSegments);

      const result = await processScanResult({
        rawSegments,
        topics,
        topicCandidates,
        settings,
        apiKey: openAiApiKey,
        previousSegments: segments,
      });

      setScanSummary({ total: rawSegments.length, accepted: result.segments.length });
      setSegments(result.segments);
      setDetailSegmentId(null);
      if (silent) {
        setStatus(`Auto scan synced (${rawSignature.slice(0, 30)}...).`);
      } else {
        setStatus(
          `Scan complete: ${result.segments.length}/${rawSegments.length} passed threshold.${result.fallbackNote}`,
        );
      }
    } catch (error) {
      if (silent) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not available") || message.includes("does not exist") || message.includes("connection")) {
        if (retryOnMissingReceiver && activeTabId) {
          setStatus("Content script not ready — reloading tab...");
          try {
            await reloadTab(activeTabId);
            await wait(900);
            await runScan(false, false);
            return;
          } catch {
            setStatus("Content script not ready — please reload the tab first.");
          }
        } else {
          setStatus("Content script not ready — please reload the tab first.");
        }
      } else {
        setStatus("Scan failed. Reload tab or reopen popup and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function runScanFullPage(): Promise<void> {
    if (!activeTabId) {
      setStatus("No active tab selected.");
      return;
    }

    setBusy(true);
    setStatus("Scanning full page (no topic filter)...");

    try {
      const response = await sendTabMessage<ExtractSegmentsResponse>(activeTabId, {
        type: "EXTRACT_SEGMENTS",
        exhaustive: settings.deepScanEnabled,
        deepScanLevel: settings.deepScanLevel,
      });

      const rawSegments = Array.isArray(response?.segments) ? response.segments : [];

      // Pass empty topics so processScanResult assigns score=1 to everything
      // and no threshold filtering is applied.
      const result = await processScanResult({
        rawSegments,
        topics: [],
        topicCandidates: [],
        settings,
        apiKey: openAiApiKey,
        previousSegments: segments,
      });

      setScanSummary({ total: rawSegments.length, accepted: result.segments.length });
      setSegments(result.segments);
      setDetailSegmentId(null);
      setStatus(`Full page scan: ${result.segments.length} segment(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not available") || message.includes("does not exist") || message.includes("connection")) {
        setStatus("Content script not ready — please reload the tab first.");
      } else {
        setStatus("Scan failed. Reload tab or reopen popup and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  function updateSegment(segmentId: number, updater: (segment: ScoredSegment) => ScoredSegment): void {
    setSegments(segments.map((segment) => (segment.id === segmentId ? updater(segment) : segment)));
  }

  async function hydrateFullText(segment: ScoredSegment): Promise<ScoredSegment> {
    if (!activeTabId || !segment.xpath) {
      return segment;
    }

    try {
      const response = await sendTabMessage<FullTextResponse>(activeTabId, {
        type: "GET_FULL_SEGMENT_TEXT",
        xpath: segment.xpath,
        textHint: segment.text,
      });

      const fullText = String(response?.text || "").trim();
      if (!fullText) {
        return segment;
      }

      const updated = { ...segment, text: fullText };
      updateSegment(segment.id, () => updated);
      return updated;
    } catch {
      return segment;
    }
  }

  async function focusInTab(segment: ScoredSegment): Promise<void> {
    if (!activeTabId || !segment.xpath) {
      return;
    }

    try {
      await sendTabMessage(activeTabId, {
        type: "HIGHLIGHT_SEGMENT",
        xpath: segment.xpath,
      });
      await activateTab(activeTabId);
    } catch {
      setStatus("Cannot focus this segment in source tab.");
    }
  }

  return { runScan, runScanFullPage, updateSegment, hydrateFullText, focusInTab };
}
