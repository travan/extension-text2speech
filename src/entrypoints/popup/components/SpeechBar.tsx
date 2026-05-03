interface VoiceOption {
  value: string;
  label: string;
}

interface SpeechBarProps {
  busy: boolean;
  canPlay: boolean;
  speaking: boolean;
  paused: boolean;
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
  busy,
  canPlay,
  speaking,
  paused,
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
      <div className="speech-controls">
        <button type="button" className="btn-scan" onClick={onScan} disabled={busy}>
          {busy ? "…" : "Scan"}
        </button>
        <button type="button" onClick={onPlayAll} disabled={!canPlay}>▶ All</button>
        <button type="button" onClick={onTogglePause} disabled={!speaking}>
          {paused ? "Resume" : "⏸"}
        </button>
        <button type="button" onClick={onStop} disabled={!speaking}>⏹</button>
        <select
          className="voice-select"
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
      <p className="status-text">{status}</p>
    </footer>
  );
}
