import type { FilterMode, PopupSettings } from "../../../types";
import { useState } from "react";
import { checkLocalModel, listLocalModels } from "../../../services/localAi";
import { parseTopics } from "../../../services/filters";

interface SettingsTabProps {
  settings: PopupSettings;
  topicCount: number;
  topicOptions: string[];
  openAiApiKey: string;
  domainHost: string | null;
  onTopicsChange: (value: string) => void;
  onThresholdChange: (value: number) => void;
  onFilterModeChange: (mode: FilterMode) => void;
  onEmbeddingModelChange: (model: string) => void;
  onLocalAiUrlChange: (url: string) => void;
  onLocalAiModelChange: (model: string) => void;
  onOpenAiApiKeyChange: (key: string) => void;
  onAutoScanEnabledChange: (enabled: boolean) => void;
  onAutoScanIntervalChange: (seconds: number) => void;
  onDeepScanEnabledChange: (enabled: boolean) => void;
  onDeepScanLevelChange: (level: number) => void;
  onSaveTopicOption: () => void;
  onToggleTopicChip: (topic: string) => void;
  onApplyDeepScanPreset: (level: number, label: string) => void;
  onSavePreset: () => Promise<void>;
  onLoadPreset: () => Promise<void>;
  onResetPreset: () => Promise<void>;
  onResetToGlobal: () => Promise<void>;
  onStartCapture: () => void;
  onStopCapture: () => void;
  onOpenResults: () => void;
}

const DEEP_SCAN_PRESETS = [
  { level: 2, label: "Fast" },
  { level: 3, label: "Balanced" },
  { level: 5, label: "Deep" },
] as const;

export function SettingsTab({
  settings,
  topicCount,
  topicOptions,
  openAiApiKey,
  domainHost,
  onTopicsChange,
  onThresholdChange,
  onFilterModeChange,
  onEmbeddingModelChange,
  onLocalAiUrlChange,
  onLocalAiModelChange,
  onOpenAiApiKeyChange,
  onAutoScanEnabledChange,
  onAutoScanIntervalChange,
  onDeepScanEnabledChange,
  onDeepScanLevelChange,
  onSaveTopicOption,
  onToggleTopicChip,
  onApplyDeepScanPreset,
  onSavePreset,
  onLoadPreset,
  onResetPreset,
  onResetToGlobal,
  onStartCapture,
  onStopCapture,
  onOpenResults,
}: SettingsTabProps) {
  const [localStatus, setLocalStatus] = useState("");
  const [checkingLocal, setCheckingLocal] = useState(false);
  const [localModels, setLocalModels] = useState<string[]>([]);
  async function checkLocal(): Promise<void> {
    setCheckingLocal(true);
    try {
      const models = await listLocalModels(settings.localAiUrl);
      setLocalModels(models);
      if (models.includes(settings.localAiModel)) await checkLocalModel(settings.localAiUrl, settings.localAiModel);
      setLocalStatus(models.includes(settings.localAiModel)
        ? `Connected · ${settings.localAiModel} installed`
        : `Connected · choose an installed chat model: ${models.join(", ") || "none"}`);
    } catch (error) {
      setLocalStatus(`Cannot connect: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCheckingLocal(false);
    }
  }
  // Flatten all saved topic options into deduplicated individual topic chips.
  const allTopicChips = [...new Set(
    topicOptions.flatMap(parseTopics),
  )];

  // Which individual topics are currently active in the textarea.
  const activeTopics = new Set(
    parseTopics(settings.topics),
  );

  return (
    <section className="form-grid">
      <div className="settings-intro"><span className="eyebrow">YOUR READING SPACE</span><h2>A little less scrolling.<br />A little more listening.</h2><p>Choose what matters. We’ll read it to you.</p></div>
      <div className="section-caption"><span>01</span> Personalize your feed</div>
      <label htmlFor="topics">Topics</label>
      <textarea
        id="topics"
        rows={2}
        value={settings.topics}
        onChange={(event) => onTopicsChange(event.target.value)}
        placeholder="e.g. design, technology, wellbeing"
      />
      <small>
        {topicCount} topics detected ·{" "}
        <button type="button" className="save-topics-link" onClick={onSaveTopicOption}>
          Save
        </button>
      </small>
      {allTopicChips.length > 0 ? (
        <div className="topic-chips" role="group" aria-label="Saved topic chips">
          {allTopicChips.map((chip) => (
            <button
              key={chip}
              type="button"
              className={`topic-chip${activeTopics.has(chip) ? " is-active" : ""}`}
              onClick={() => onToggleTopicChip(chip)}
              title={activeTopics.has(chip) ? `Remove "${chip}"` : `Add "${chip}"`}
            >
              {chip}
            </button>
          ))}
        </div>
      ) : null}

      <details className="advanced-settings"><summary>Fine-tune your reading <span>Optional</span></summary><div className="advanced-content">
      <label htmlFor="threshold">Threshold: {settings.threshold.toFixed(2)}</label>
      <input
        id="threshold"
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={settings.threshold}
        onChange={(event) => onThresholdChange(Number(event.target.value))}
      />

      <label htmlFor="filterMode">Filter mode</label>
      <select
        id="filterMode"
        value={settings.filterMode}
        onChange={(event) => onFilterModeChange(event.target.value as FilterMode)}
      >
        <option value="basic">Basic</option>
        <option value="ai">AI</option>
        <option value="local">Local AI (Ollama)</option>
      </select>

      {settings.filterMode === "local" ? (
        <>
          <label htmlFor="localAiUrl">Ollama URL</label>
          <input id="localAiUrl" value={settings.localAiUrl}
            onChange={(event) => { onLocalAiUrlChange(event.target.value); setLocalStatus(""); setLocalModels([]); }} />
          <label htmlFor="localAiModel">Local chat model</label>
          <input id="localAiModel" list="localModels" value={settings.localAiModel}
            onChange={(event) => { onLocalAiModelChange(event.target.value); setLocalStatus(""); }} />
          <datalist id="localModels">{localModels.map((model) => <option key={model} value={model} />)}</datalist>
          <button type="button" disabled={checkingLocal} onClick={() => void checkLocal()}>
            {checkingLocal ? "Connecting..." : "Check local AI"}
          </button>
          <small role="status">{localStatus}</small>
          <small>Scan sends up to 40 excerpts to Ollama on this device. No API key required.
            Remaining excerpts use Basic filtering. Local scans may take up to 2 minutes.</small>
        </>
      ) : null}

      {settings.filterMode === "ai" ? (
        <>
          <label htmlFor="embeddingModel">Embedding model</label>
          <input
            id="embeddingModel"
            type="text"
            value={settings.embeddingModel}
            onChange={(event) => onEmbeddingModelChange(event.target.value)}
          />
          <label htmlFor="openaiApiKey">OpenAI API key</label>
          <input
            id="openaiApiKey"
            type="password"
            value={openAiApiKey}
            onChange={(event) => onOpenAiApiKeyChange(event.target.value)}
            placeholder="sk-..."
          />
        </>
      ) : null}

      <label className="row-toggle">
        <input
          type="checkbox"
          checked={settings.autoScanEnabled}
          onChange={(event) => onAutoScanEnabledChange(event.target.checked)}
        />
        <span>Auto scan ({settings.autoScanIntervalSec}s)</span>
      </label>
      <input
        id="autoScanInterval"
        type="range"
        min={2}
        max={15}
        step={1}
        value={settings.autoScanIntervalSec}
        onChange={(event) => onAutoScanIntervalChange(Number(event.target.value))}
      />

      <label className="row-toggle">
        <input
          type="checkbox"
          checked={settings.deepScanEnabled}
          onChange={(event) => onDeepScanEnabledChange(event.target.checked)}
        />
        <span>Deep scan (level {settings.deepScanLevel})</span>
      </label>
      <input
        id="deepScanLevel"
        type="range"
        min={1}
        max={5}
        step={1}
        value={settings.deepScanLevel}
        onChange={(event) => onDeepScanLevelChange(Number(event.target.value))}
      />
      <div className="deep-scan-presets">
        {DEEP_SCAN_PRESETS.map(({ level, label }) => (
          <button
            key={level}
            type="button"
            className={`preset-btn${settings.deepScanEnabled && settings.deepScanLevel === level ? " is-active" : ""}`}
            onClick={() => onApplyDeepScanPreset(level, label)}
          >
            {label}
          </button>
        ))}
      </div>

      </div></details>

      <details className="advanced-settings"><summary>Saved preferences & capture</summary><div className="advanced-content">
      <div className="action-row">
        <button type="button" onClick={() => void onSavePreset()}>Save preset</button>
        <button type="button" onClick={() => void onLoadPreset()}>Load preset</button>
        <button type="button" onClick={() => void onResetPreset()} disabled={!domainHost}>Reset</button>
        <button type="button" onClick={() => void onResetToGlobal()} disabled={!domainHost}>↩ Global</button>
      </div>
      {!domainHost ? (
        <p className="preset-helper">Preset actions disabled — no valid domain.</p>
      ) : null}

      <hr className="section-divider" />

      <div className="action-row">
        <button type="button" onClick={onStartCapture}>Start capture</button>
        <button type="button" onClick={onStopCapture}>Stop capture</button>
        <button type="button" onClick={onOpenResults}>Results ↗</button>
      </div>
      <small>Feed capture uses Basic filtering. AI modes apply to Scan.</small>
      </div></details>
    </section>
  );
}
