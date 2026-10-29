import { ReadingText } from "./ReadingText";
import type { ScoredSegment } from "../../../services/scan";

interface ArticlesTabProps {
  segments: ScoredSegment[];
  scanTotal: number;
  scanAccepted: number;
  currentReadingSegmentId: number | null;
  readingRange: { start: number; end: number } | null;
  paused: boolean;
  onRefresh: () => void;
  onScanWithoutFilter: () => void;
  busy: boolean;
  onUpdateSegment: (id: number, updater: (segment: ScoredSegment) => ScoredSegment) => void;
  onPlaySingle: (segment: ScoredSegment) => void;
  onFocus: (segment: ScoredSegment) => Promise<void>;
  onOpenDetail: (segment: ScoredSegment) => void;
}

export function ArticlesTab({
  segments,
  scanTotal,
  scanAccepted,
  currentReadingSegmentId,
  readingRange,
  paused,
  onRefresh,
  onScanWithoutFilter,
  busy,
  onUpdateSegment,
  onPlaySingle,
  onFocus,
  onOpenDetail,
}: ArticlesTabProps) {
  return (
    <section className="segments-list">
      <div className="list-stats-row">
        <p className="list-stats">{scanTotal} total · {scanAccepted} accepted</p>
        <button type="button" className="refresh-btn" onClick={onRefresh} disabled={busy} title="Scan again at the source page’s current scroll position">↻ Refresh</button>
      </div>
      {scanTotal > scanAccepted ? (
        <div className="scan-filter-notice" role="status">
          <p>{scanTotal - scanAccepted} text block(s) hidden by the topic filter. Missing the text you’re viewing?</p>
          <button type="button" disabled={busy} onClick={onScanWithoutFilter}>Scan this area without topic filter</button>
        </div>
      ) : null}
      {segments.length === 0 ? (
        <p className="empty-hint">{scanTotal > 0 ? "No matching text. Change Topics or lower the threshold, then Scan again." : "No text found yet — run Scan on a webpage. Clear Topics to show all loaded text."}</p>
      ) : null}
      {segments.map((segment) => (
        <article
          key={segment.id}
          className={`segment-card${currentReadingSegmentId === segment.id ? " is-reading" : ""}${currentReadingSegmentId === segment.id && paused ? " is-paused" : ""}`}
          aria-current={currentReadingSegmentId === segment.id ? "true" : undefined}
        >
          <div className="segment-head">
            <strong className="score-badge">{Math.round(segment.score * 100)}%</strong>
            {currentReadingSegmentId === segment.id ? (
              <span className="reading-badge">{paused ? "Paused" : "Reading…"}</span>
            ) : null}
            <label className="segment-check">
              <input
                type="checkbox"
                checked={segment.selected}
                onChange={(event) =>
                  onUpdateSegment(segment.id, (item) => ({ ...item, selected: event.target.checked }))
                }
              />
              <span>Include</span>
            </label>
          </div>
          <ReadingText text={segment.text} active={currentReadingSegmentId === segment.id} range={readingRange} className="segment-text" />
          {segment.matchedKeywords.length > 0 ? (
            <p className="segment-keywords">Keywords: {segment.matchedKeywords.join(", ")}</p>
          ) : null}
          <div className="segment-actions">
            <button type="button" onClick={() => onPlaySingle(segment)}>{currentReadingSegmentId === segment.id && paused ? "▶ Resume" : "▶ Read"}</button>
            <button type="button" onClick={() => void onFocus(segment)}>Focus</button>
            <button type="button" onClick={() => onOpenDetail(segment)}>Detail →</button>
          </div>
        </article>
      ))}
    </section>
  );
}
