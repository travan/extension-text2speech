import { DEFAULT_SETTINGS } from "../../../stores/usePopupStore";
import { getLocal } from "../../../chrome/storage";
import { deletePresetForHost, loadPresetForHost, savePresetForHost } from "../../../services/presets";
import type { PopupSettings } from "../../../types";

const GLOBAL_SETTINGS_KEY = "globalSettings";

interface UsePresetsOptions {
  domainHost: string | null;
  settings: PopupSettings;
  replaceSettings: (settings: PopupSettings) => void;
  onStatus: (message: string) => void;
}

export interface UsePresetsReturn {
  savePreset: () => Promise<void>;
  loadPreset: () => Promise<void>;
  resetPreset: () => Promise<void>;
  resetToGlobal: () => Promise<void>;
}

export function usePresets({
  domainHost,
  settings,
  replaceSettings,
  onStatus,
}: UsePresetsOptions): UsePresetsReturn {
  function mergeSettings(next: Partial<PopupSettings>): PopupSettings {
    return { ...DEFAULT_SETTINGS, ...settings, ...next };
  }

  async function savePreset(): Promise<void> {
    try {
      const result = await savePresetForHost(domainHost, settings);
      if (result === "domain") {
        onStatus(`Preset saved for ${domainHost}.`);
      } else {
        onStatus("No domain detected — preset not saved.");
      }
    } catch {
      onStatus("Cannot save preset right now.");
    }
  }

  async function loadPreset(): Promise<void> {
    try {
      const loaded = await loadPresetForHost(domainHost);
      if (loaded) {
        replaceSettings(mergeSettings(loaded.settings));
        onStatus(`Loaded ${loaded.source} preset.`);
      } else {
        onStatus("No domain preset found — using current settings.");
      }
    } catch {
      onStatus("Cannot load preset right now.");
    }
  }

  async function resetPreset(): Promise<void> {
    if (!domainHost) {
      onStatus("No domain detected - nothing to reset.");
      return;
    }
    try {
      await deletePresetForHost(domainHost);
      onStatus(`Preset cleared for ${domainHost}.`);
    } catch {
      onStatus("Cannot reset domain preset right now.");
    }
  }

  async function resetToGlobal(): Promise<void> {
    if (!domainHost) {
      onStatus("No domain detected - using global settings.");
      return;
    }
    try {
      await deletePresetForHost(domainHost);
      const fromStorage = await getLocal([GLOBAL_SETTINGS_KEY]);
      const loaded = (fromStorage[GLOBAL_SETTINGS_KEY] ?? DEFAULT_SETTINGS) as PopupSettings;
      replaceSettings({ ...DEFAULT_SETTINGS, ...loaded });
      onStatus(`Reset to global preset for ${domainHost}.`);
    } catch {
      onStatus("Cannot reset to global preset right now.");
    }
  }

  return { savePreset, loadPreset, resetPreset, resetToGlobal };
}
