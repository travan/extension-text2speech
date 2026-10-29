import type { ScanScope } from "../../../services/renderedText";
interface VoiceOption {
  value: string;
  label: string;
}

interface SpeechBarProps {
  scope: ScanScope;
  onScopeChange: (scope: ScanScope) => void;
  busy: boolean;
  canPlay: boolean;
  speaking: boolean;
  paused: boolean;
  canNext: boolean;
  onNext: () => void;
  status: string;
  defaultVoice: string;
  voiceOptions: VoiceOption[];
  onScan: () => void;
  onPlayAll: () => void;
  onTogglePause: () => void;
  onStop: () => void;
  onVoiceChange: (voice: string) => void;
}

export function SpeechBar({
  scope,
  onScopeChange,
  busy,
  canPlay,
  speaking,
  paused,
  canNext,
  onNext,
  status,
  defaultVoice,
  voiceOptions,
  onScan,
  onPlayAll,
  onTogglePause,
  onStop,
  onVoiceChange,
}: SpeechBarProps) {
  return (
    <footer className="speech-bar">
      <label className="scan-scope">Phạm vi quét
        <select aria-label="Scan scope" value={scope} disabled={busy} onChange={(event) => onScopeChange(event.target.value as ScanScope)}>
          <option value="viewport">Vùng đang xem</option>
          <option value="page">Toàn trang đã tải</option>
        </select>
      </label>
      <div className="speech-controls">
        <button type="button" className="btn-scan" onClick={onScan} disabled={busy}>
          {busy ? "…" : "Scan"}
        </button>
        <button type="button" onClick={onPlayAll} disabled={!canPlay && !speaking}>{paused ? "▶ Resume" : speaking ? "▶ Playing" : "▶ All"}</button>
        <button type="button" onClick={onTogglePause} disabled={!speaking} aria-label={paused ? "Resume reading" : "Pause reading"}>
          {paused ? "Resume" : "⏸"}
        </button>
        <button type="button" onClick={onNext} disabled={!canNext} aria-label="Next segment" title="Skip to the next included segment">Next ⏭</button>
        <button type="button" onClick={onStop} disabled={!speaking} aria-label="Stop reading">⏹</button>
        <select
          className="voice-select"
          aria-label="Reading voice"
          value={defaultVoice}
          onChange={(event) => onVoiceChange(event.target.value)}
        >
          {voiceOptions.map((option) => (
            <option key={`bar-${option.value || "auto"}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <p className="status-text" aria-live="polite" title={status}>{status}</p>
    </footer>
  );
}
