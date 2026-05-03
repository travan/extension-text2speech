import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "../../../../../src/stores/usePopupStore";
import { usePresets } from "../../../../../src/entrypoints/popup/hooks/usePresets";
import type { PopupSettings } from "../../../../../src/types";

const mocks = vi.hoisted(() => ({
  savePresetForHost: vi.fn(),
  loadPresetForHost: vi.fn(),
  deletePresetForHost: vi.fn(),
  getLocal: vi.fn(),
}));

vi.mock("../../../../../src/services/presets", () => ({
  savePresetForHost: mocks.savePresetForHost,
  loadPresetForHost: mocks.loadPresetForHost,
  deletePresetForHost: mocks.deletePresetForHost,
}));

vi.mock("../../../../../src/chrome/storage", () => ({
  getLocal: mocks.getLocal,
}));

const baseSettings: PopupSettings = {
  ...DEFAULT_SETTINGS,
  topics: "ai, startup",
  threshold: 0.4,
};

describe("usePresets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves preset for current domain", async () => {
    mocks.savePresetForHost.mockResolvedValue("domain");
    const onStatus = vi.fn();

    const api = usePresets({
      domainHost: "example.com",
      settings: baseSettings,
      replaceSettings: vi.fn(),
      onStatus,
    });

    await api.savePreset();

    expect(mocks.savePresetForHost).toHaveBeenCalledWith("example.com", baseSettings);
    expect(onStatus).toHaveBeenCalledWith("Preset saved for example.com.");
  });

  it("returns not-saved message when no domain", async () => {
    mocks.savePresetForHost.mockResolvedValue("none");
    const onStatus = vi.fn();

    const api = usePresets({
      domainHost: null,
      settings: baseSettings,
      replaceSettings: vi.fn(),
      onStatus,
    });

    await api.savePreset();

    expect(onStatus).toHaveBeenCalledWith("No domain detected — preset not saved.");
  });

  it("loads and merges preset into current settings", async () => {
    mocks.loadPresetForHost.mockResolvedValue({
      source: "domain",
      settings: { topics: "react" },
    });

    const onStatus = vi.fn();
    const replaceSettings = vi.fn();

    const api = usePresets({
      domainHost: "example.com",
      settings: { ...baseSettings, threshold: 0.55 },
      replaceSettings,
      onStatus,
    });

    await api.loadPreset();

    expect(replaceSettings).toHaveBeenCalledTimes(1);
    const merged = replaceSettings.mock.calls[0][0] as PopupSettings;
    expect(merged.topics).toBe("react");
    expect(merged.threshold).toBe(0.55);
    expect(onStatus).toHaveBeenCalledWith("Loaded domain preset.");
  });

  it("shows no-preset message when load is empty", async () => {
    mocks.loadPresetForHost.mockResolvedValue(null);
    const onStatus = vi.fn();

    const api = usePresets({
      domainHost: "example.com",
      settings: baseSettings,
      replaceSettings: vi.fn(),
      onStatus,
    });

    await api.loadPreset();

    expect(onStatus).toHaveBeenCalledWith("No domain preset found — using current settings.");
  });

  it("resetPreset exits early when domain is missing", async () => {
    const onStatus = vi.fn();

    const api = usePresets({
      domainHost: null,
      settings: baseSettings,
      replaceSettings: vi.fn(),
      onStatus,
    });

    await api.resetPreset();

    expect(mocks.deletePresetForHost).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith("No domain detected - nothing to reset.");
  });

  it("resetToGlobal replaces settings from global storage", async () => {
    mocks.deletePresetForHost.mockResolvedValue(undefined);
    mocks.getLocal.mockResolvedValue({
      globalSettings: { topics: "global", autoScanEnabled: true, autoScanIntervalSec: 6 },
    });

    const onStatus = vi.fn();
    const replaceSettings = vi.fn();

    const api = usePresets({
      domainHost: "example.com",
      settings: baseSettings,
      replaceSettings,
      onStatus,
    });

    await api.resetToGlobal();

    expect(mocks.deletePresetForHost).toHaveBeenCalledWith("example.com");
    expect(mocks.getLocal).toHaveBeenCalledWith(["globalSettings"]);
    expect(replaceSettings).toHaveBeenCalledTimes(1);

    const next = replaceSettings.mock.calls[0][0] as PopupSettings;
    expect(next.topics).toBe("global");
    expect(next.autoScanEnabled).toBe(true);
    expect(next.autoScanIntervalSec).toBe(6);
    expect(onStatus).toHaveBeenCalledWith("Reset to global preset for example.com.");
  });
});
