import { ReadingText } from "./ReadingText";
import type { ScoredSegment } from "../../../services/scan";

interface VoiceOption {
  value: string;
  label: string;
}

interface DetailTabProps {
  detailSegment: ScoredSegment | null;
  currentReadingSegmentId: number | null;
  readingRange: { start: number; end: number } | null;
  voiceOptions: VoiceOption[];
  onBack: () => void;
  onHydrate: (segment: ScoredSegment) => Promise<ScoredSegment>;
  onFocus: (segment: ScoredSegment) => Promise<void>;
  onPlaySingle: (segment: ScoredSegment) => void;
  onUpdateSegment: (id: number, updater: (segment: ScoredSegment) => ScoredSegment) => void;
}

export function DetailTab({
  detailSegment,
  currentReadingSegmentId,
  readingRange,
  voiceOptions,
  onBack,
  onHydrate,
  onFocus,
  onPlaySingle,
  onUpdateSegment,
}: DetailTabProps) {
  if (!detailSegment) {
    return (
      <section className="detail-view">
        <p>
          No segment selected.{" "}
          <button type="button" className="link-btn" onClick={onBack}>
            Go to Articles
          </button>{" "}
          and tap Detail.
        </p>
      </section>
    );
  }

  return (
    <section className="detail-view">
      <button type="button" className="back-btn" onClick={onBack}>← Back</button>
      <div className="detail-meta">
        <strong>Score: {detailSegment.score.toFixed(2)}</strong>
        {detailSegment.matchedKeywords.length > 0 ? (
          <p className="segment-keywords">Keywords: {detailSegment.matchedKeywords.join(", ")}</p>
        ) : null}
      </div>
      <ReadingText text={detailSegment.text} active={currentReadingSegmentId === detailSegment.id} range={readingRange} className="detail-text" />
      <div className="detail-actions">
        <button
          type="button"
          onClick={() => void onHydrate(detailSegment)}
        >
          Hydrate
        </button>
        <button type="button" onClick={() => void onFocus(detailSegment)}>Focus in tab</button>
        <button type="button" onClick={() => onPlaySingle(detailSegment)}>▶ Read this</button>
      </div>
      <label htmlFor="segmentVoice">Voice (this item)</label>
      <select
        id="segmentVoice"
        value={detailSegment.voice}
        onChange={(event) =>
          onUpdateSegment(detailSegment.id, (item) => ({ ...item, voice: event.target.value }))
        }
      >
        {voiceOptions.map((option) => (
          <option key={`det-${option.value || "auto"}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </section>
  );
}
