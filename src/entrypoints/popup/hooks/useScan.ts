import { useEffect, useRef } from "react";

import { expandTopicCandidates, parseTopics } from "../../../services/filters";
import { buildRawSignature, processScanResult, type RawSegment, type ScoredSegment } from "../../../services/scan";
import { sendTabMessage } from "../../../chrome/messaging";
import { activateTab } from "../../../chrome/tabs";
import type { PopupSettings } from "../../../types";

type ExtractSegmentsResponse = { ok?: boolean; error?: string; segments?: RawSegment[] };
type FullTextResponse = { ok?: boolean; text?: string };

interface UseScanOptions {
  activeTabId: number | null;
  settings: PopupSettings;
  openAiApiKey: string;
  segments: ScoredSegment[];
  setBusy: (busy: boolean) => void;
  setStatus: (message: string) => void;
  setScanSummary: (summary: { total: number; accepted: number }) => void;
  setSegments: (segments: ScoredSegment[] | ((previous: ScoredSegment[]) => ScoredSegment[])) => void;
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
  const inFlight = useRef(false);
  const latestScan = useRef(runScan);
  const lastScanKey = useRef("");
  const currentConfig = JSON.stringify([activeTabId, settings, openAiApiKey]);
  const configRef = useRef(currentConfig);
  useEffect(() => { latestScan.current = runScan; configRef.current = currentConfig; });

  useEffect(() => {
    if (!settings.autoScanEnabled || !activeTabId) {
      return;
    }

    const timer = globalThis.setInterval(() => {
      latestScan.current(true).catch(() => undefined);
    }, Math.max(2, settings.autoScanIntervalSec) * 1000);

    return () => globalThis.clearInterval(timer);
  }, [settings.autoScanEnabled, settings.autoScanIntervalSec, activeTabId]);

  async function runScan(silent = false): Promise<void> {
    if (!activeTabId) {
      setStatus("No active tab selected.");
      return;
    }

    if (inFlight.current) return;
    inFlight.current = true;
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

      if (response?.ok === false) throw new Error(response.error || "Content extraction failed");
      const rawSegments = Array.isArray(response?.segments) ? response.segments : [];
      const topics = parseTopics(settings.topics);
      const topicCandidates = expandTopicCandidates(topics);
      const rawSignature = buildRawSignature(rawSegments);
      const scanKey = JSON.stringify([activeTabId, rawSignature, settings, openAiApiKey]);
      if (silent && scanKey === lastScanKey.current) return;

      const result = await processScanResult({
        rawSegments,
        topics,
        topicCandidates,
        settings,
        apiKey: openAiApiKey,
        previousSegments: segments,
      });

      if (configRef.current !== currentConfig) {
        setStatus("Settings changed during scan. Scan again to apply them.");
        return;
      }
      setScanSummary({ total: rawSegments.length, accepted: result.segments.length });
      setSegments((previous) => {
        const choices = new Map(previous.map((segment) => [segment.xpath, segment]));
        return result.segments.map((segment) => ({
          ...segment,
          selected: choices.get(segment.xpath)?.selected ?? segment.selected,
          voice: choices.get(segment.xpath)?.voice ?? segment.voice,
        }));
      });
      setDetailSegmentId(null);
      // Retry failures on the next interval; cache only successful processing.
      lastScanKey.current = result.fallbackNote.includes("không khả dụng") || result.fallbackNote.includes("fallback") ? "" : scanKey;
      if (silent) {
        setStatus(`Auto scan: ${result.segments.length}/${rawSegments.length}.${result.fallbackNote}`);
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
        setStatus("Content script not ready — please reload the tab first.");
      } else {
        setStatus("Scan failed. Reload tab or reopen popup and try again.");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function runScanFullPage(): Promise<void> {
    if (!activeTabId) {
      setStatus("No active tab selected.");
      return;
    }

    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setStatus("Scanning full page (no topic filter)...");

    try {
      const response = await sendTabMessage<ExtractSegmentsResponse>(activeTabId, {
        type: "EXTRACT_SEGMENTS",
        exhaustive: settings.deepScanEnabled,
        deepScanLevel: settings.deepScanLevel,
      });

      if (response?.ok === false) throw new Error(response.error || "Content extraction failed");
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

      if (configRef.current !== currentConfig) return;
      lastScanKey.current = "";
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
      inFlight.current = false;
      setBusy(false);
    }
  }

  function updateSegment(segmentId: number, updater: (segment: ScoredSegment) => ScoredSegment): void {
    setSegments((previous) => previous.map((segment) => (segment.id === segmentId ? updater(segment) : segment)));
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
      if (configRef.current === currentConfig) {
        updateSegment(segment.id, (current) => current.xpath === segment.xpath
          ? { ...current, text: fullText } : current);
      }
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
