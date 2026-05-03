import { useEffect, useMemo, useState } from "react";

import type { CaptureRecord } from "../../types";
import { parseTopics } from "../../services/filters";
import { getLocal, removeLocal, setLocal } from "../../chrome/storage";
import { activateTab } from "../../chrome/tabs";
import { sendTabMessage } from "../../chrome/messaging";

function detectTabIdFromQuery(): number | null {
  const value = new URLSearchParams(globalThis.location.search).get("tabId");
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function ResultsApp() {
  const [tabIdInput, setTabIdInput] = useState<number | null>(detectTabIdFromQuery());
  const [status, setStatus] = useState("Ready.");
  const [items, setItems] = useState<CaptureRecord[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [topicOptions, setTopicOptions] = useState<string[]>([]);

  const storageKey = useMemo(() => (tabIdInput ? `captureResults_${tabIdInput}` : null), [tabIdInput]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pagedItems = useMemo(() => {
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize, totalPages]);

  async function refresh(): Promise<void> {
    if (!storageKey) {
      setStatus("Enter a tab id to load capture results.");
      setItems([]);
      return;
    }

    const data = await getLocal(storageKey);
    const payload = data?.[storageKey] as { items?: CaptureRecord[]; updatedAt?: number; domain?: string } | undefined;
    const rows = Array.isArray(payload?.items) ? payload.items : [];
    rows.sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
    setItems(rows);
    setPage((prev) => Math.min(prev, Math.max(1, Math.ceil(rows.length / pageSize))));
    setStatus(`Loaded ${rows.length} records.`);
  }

  async function clearStorage(): Promise<void> {
    if (!storageKey) {
      return;
    }

    await removeLocal(storageKey);
    setItems([]);
    setStatus("Capture storage cleared.");
  }

  useEffect(() => {
    getLocal(["topicOptions"])
      .then((data) => {
        const raw = data["topicOptions"];
        const list = Array.isArray(raw)
          ? raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [];
        setTopicOptions(list);
      })
      .catch(() => undefined);
  }, []);

  async function loadTopicOption(option: string): Promise<void> {
    const store = await getLocal(["globalSettings"]);
    const current = (store.globalSettings ?? {}) as Record<string, unknown>;
    await setLocal({ globalSettings: { ...current, topics: option } });
    setStatus(`Topics set to: ${option}`);
  }

  async function deleteTopicOption(option: string): Promise<void> {
    const updated = topicOptions.filter((item) => item !== option);
    setTopicOptions(updated);
    await setLocal({ topicOptions: updated });
    setStatus("Topic option removed.");
  }

  useEffect(() => {
    void refresh();
  }, [storageKey]);

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      refresh().catch(() => undefined);
    }, 2000);
    return () => globalThis.clearInterval(timer);
  }, [storageKey, pageSize]);

  async function startCapture(): Promise<void> {
    if (!tabIdInput) {
      setStatus("Missing source tab id.");
      return;
    }

    const store = await getLocal(["globalSettings"]);
    const settings = (store.globalSettings ?? {}) as { topics?: string; threshold?: number };
    const topics = parseTopics(String(settings.topics ?? ""));
    if (!topics.length) {
      setStatus("No topic in global settings. Set topics in popup first.");
      return;
    }

    try {
      await sendTabMessage(tabIdInput, {
        type: "START_CAPTURE",
        tabId: tabIdInput,
        topics,
        threshold: Number(settings.threshold) || 0.35,
      });
      setStatus("Capture started. Browse source tab to collect segments.");
    } catch {
      setStatus("Cannot start capture. Reload source tab and retry.");
    }
  }

  async function stopCapture(): Promise<void> {
    if (!tabIdInput) {
      return;
    }
    try {
      await sendTabMessage(tabIdInput, { type: "STOP_CAPTURE" });
      setStatus("Capture stopped.");
    } catch {
      setStatus("Cannot stop capture.");
    }
  }

  async function gotoSegment(item: CaptureRecord): Promise<void> {
    if (!tabIdInput) {
      return;
    }
    const xpath = String(item.xpath || "").trim();
    if (!xpath) {
      setStatus("This item has no xpath to highlight.");
      return;
    }
    try {
      await activateTab(tabIdInput);
      await sendTabMessage(tabIdInput, { type: "HIGHLIGHT_SEGMENT", xpath });
    } catch {
      setStatus("Cannot jump to segment on source tab.");
    }
  }

  return (
    <main className="results-root">
      <header>
        <h1>Feed Capture Results (React)</h1>
        <p>{status}</p>
      </header>

      <section className="toolbar">
        <label htmlFor="tabId">Source tab id</label>
        <input
          id="tabId"
          type="number"
          min={1}
          value={tabIdInput ?? ""}
          onChange={(event) => {
            const value = Number(event.target.value);
            setTabIdInput(Number.isFinite(value) && value > 0 ? value : null);
          }}
        />
        <button type="button" onClick={() => void refresh()}>
          Refresh
        </button>
        <button type="button" onClick={() => void startCapture()}>
          Start capture
        </button>
        <button type="button" onClick={() => void stopCapture()}>
          Stop capture
        </button>
        <button type="button" onClick={() => void clearStorage()}>
          Clear
        </button>
      </section>

      <section className="stats">
        <strong>{items.length}</strong> records
      </section>

      <section className="pager">
        <label htmlFor="pageSize">Rows per page</label>
        <select
          id="pageSize"
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(1);
          }}
        >
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          Prev
        </button>
        <span>
          Page {Math.min(page, totalPages)}/{totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </section>

      {topicOptions.length > 0 && (
        <section className="topic-options">
          <h2>Saved topic options</h2>
          <ul className="topic-options-list">
            {topicOptions.map((option) => (
              <li key={option} className="topic-option-item">
                <span className="topic-option-text">{option}</span>
                <div className="topic-option-actions">
                  <button type="button" onClick={() => void loadTopicOption(option)}>
                    Use
                  </button>
                  <button type="button" className="btn-danger" onClick={() => void deleteTopicOption(option)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="items">
        {items.length === 0 && <p>No records available.</p>}
        {pagedItems.map((item) => (
          <article key={item.key} className="card">
            <div className="head">
              <strong>{item.score.toFixed(2)}</strong>
              <span>{new Date(item.lastSeenAt || item.firstSeenAt || item.capturedAt || Date.now()).toLocaleString()}</span>
            </div>
            <p>{item.matchedKeywords?.length ? `Keywords: ${item.matchedKeywords.join(", ")}` : "Keywords: -"}</p>
            <p>{item.text}</p>
            <div className="actions">
              <button type="button" onClick={() => void gotoSegment(item)}>
                Goto
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
