import { describe, it, expect, vi, beforeEach } from "vitest";
import { deletePresetForHost, loadPresetForHost, normalizePresetHost, savePresetForHost } from "../../../src/services/presets";
import type { PopupSettings } from "../../../src/types";

// Mock chrome storage wrappers
vi.mock("../../../src/chrome/storage", () => {
  const store: Record<string, unknown> = {};
  return {
    getLocal: async (keys?: string[]) => {
      if (!keys) return { ...store };
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = store[k];
      return out;
    },
    setLocal: async (payload: Record<string, unknown>) => {
      Object.assign(store, payload);
    },
  };
});

// Access the mutable store used inside the mock for test reset.
async function clearStore() {
  const mod = await import("../../../src/chrome/storage");
  await mod.setLocal({ domainPresets: undefined });
}

const sampleSettings: PopupSettings = {
  topics: "ai, startup",
  threshold: 0.4,
  filterMode: "basic",
  embeddingModel: "text-embedding-3-small",
  defaultVoice: "",
  autoScanEnabled: false,
  autoScanIntervalSec: 4,
  deepScanEnabled: true,
  deepScanLevel: 3,
};

describe("presets service", () => {
  beforeEach(async () => {
    await clearStore();
  });

  it("returns null when no preset exists for host", async () => {
    const result = await loadPresetForHost("example.com");
    expect(result).toBeNull();
  });

  it("returns null when host is null", async () => {
    const result = await loadPresetForHost(null);
    expect(result).toBeNull();
  });

  it("normalizes invalid host values to null", () => {
    expect(normalizePresetHost("-")).toBeNull();
    expect(normalizePresetHost("  ")).toBeNull();
    expect(normalizePresetHost("undefined")).toBeNull();
    expect(normalizePresetHost(null)).toBeNull();
  });

  it("normalizes host casing and whitespace", () => {
    expect(normalizePresetHost("  Example.COM ")).toBe("example.com");
  });

  it("saves and loads a domain preset", async () => {
    const saved = await savePresetForHost("example.com", sampleSettings);
    expect(saved).toBe("domain");

    const loaded = await loadPresetForHost("example.com");
    expect(loaded).not.toBeNull();
    expect(loaded?.source).toBe("domain");
    expect(loaded?.settings.topics).toBe("ai, startup");
    expect(loaded?.settings.threshold).toBe(0.4);
  });

  it("returns 'none' when host is null on save", async () => {
    const saved = await savePresetForHost(null, sampleSettings);
    expect(saved).toBe("none");
  });

  it("different hosts have independent presets", async () => {
    await savePresetForHost("site-a.com", { ...sampleSettings, topics: "react" });
    await savePresetForHost("site-b.com", { ...sampleSettings, topics: "typescript" });

    const a = await loadPresetForHost("site-a.com");
    const b = await loadPresetForHost("site-b.com");
    expect(a?.settings.topics).toBe("react");
    expect(b?.settings.topics).toBe("typescript");
  });

  it("treats host keys case-insensitively when loading/deleting", async () => {
    await savePresetForHost("Example.COM", { ...sampleSettings, topics: "normalized" });

    const loaded = await loadPresetForHost("example.com");
    expect(loaded?.settings.topics).toBe("normalized");

    await deletePresetForHost("EXAMPLE.COM");
    const afterDelete = await loadPresetForHost("example.com");
    expect(afterDelete).toBeNull();
  });

  it("deletes a domain preset", async () => {
    await savePresetForHost("example.com", sampleSettings);
    await deletePresetForHost("example.com");

    const loaded = await loadPresetForHost("example.com");
    expect(loaded).toBeNull();
  });

  it("deletePresetForHost is a no-op for null host", async () => {
    await expect(deletePresetForHost(null)).resolves.toBeUndefined();
  });
});
