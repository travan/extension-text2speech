import type { ScoredSegment } from "../../../services/scan";

interface ArticlesTabProps {
  segments: ScoredSegment[];
  scanTotal: number;
  scanAccepted: number;
  currentReadingSegmentId: number | null;
  onRefresh: () => void;
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
  onRefresh,
  onUpdateSegment,
  onPlaySingle,
  onFocus,
  onOpenDetail,
}: ArticlesTabProps) {
  return (
    <section className="segments-list">
      <div className="list-stats-row">
        <p className="list-stats">{scanTotal} total · {scanAccepted} accepted</p>
        <button type="button" className="refresh-btn" onClick={onRefresh} title="Re-scan page">↻ Refresh</button>
      </div>
      {segments.length === 0 ? (
        <p className="empty-hint">No segments yet — run Scan first.</p>
      ) : null}
      {segments.map((segment) => (
        <article
          key={segment.id}
          className={`segment-card${currentReadingSegmentId === segment.id ? " is-reading" : ""}`}
        >
          <div className="segment-head">
            <strong className="score-badge">{Math.round(segment.score * 100)}%</strong>
            {currentReadingSegmentId === segment.id ? (
              <span className="reading-badge">Reading…</span>
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
          <p className="segment-text">{segment.text}</p>
          {segment.matchedKeywords.length > 0 ? (
            <p className="segment-keywords">Keywords: {segment.matchedKeywords.join(", ")}</p>
          ) : null}
          <div className="segment-actions">
            <button type="button" onClick={() => onPlaySingle(segment)}>▶ Read</button>
            <button type="button" onClick={() => void onFocus(segment)}>Focus</button>
            <button type="button" onClick={() => onOpenDetail(segment)}>Detail →</button>
          </div>
        </article>
      ))}
    </section>
  );
}
