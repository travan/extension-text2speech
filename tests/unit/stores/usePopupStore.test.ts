import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, usePopupStore } from "../../../src/stores/usePopupStore";

function resetStore(): void {
  usePopupStore.setState({
    settings: { ...DEFAULT_SETTINGS },
    status: "Ready.",
    scan: { total: 0, accepted: 0 },
    segments: [],
    detailSegmentId: null,
    busy: false,
    activeTabId: null,
    activeHost: "-",
  });
}

describe("usePopupStore", () => {
  beforeEach(() => {
    resetStore();
  });

  it("starts with default state", () => {
    const state = usePopupStore.getState();
    expect(state.settings).toEqual(DEFAULT_SETTINGS);
    expect(state.status).toBe("Ready.");
    expect(state.scan).toEqual({ total: 0, accepted: 0 });
    expect(state.segments).toEqual([]);
  });

  it("updates nested settings via setters", () => {
    const state = usePopupStore.getState();

    state.setTopics("ai, startup");
    state.setThreshold(0.6);
    state.setFilterMode("ai");
    state.setEmbeddingModel("text-embedding-3-small");
    state.setDefaultVoice("vi-VN");

    const next = usePopupStore.getState();
    expect(next.settings.topics).toBe("ai, startup");
    expect(next.settings.threshold).toBe(0.6);
    expect(next.settings.filterMode).toBe("ai");
    expect(next.settings.embeddingModel).toBe("text-embedding-3-small");
    expect(next.settings.defaultVoice).toBe("vi-VN");
  });

  it("updates top-level ui state", () => {
    const state = usePopupStore.getState();

    state.setBusy(true);
    state.setStatus("Scanning");
    state.setActiveTab(99, "example.com");
    state.setScanSummary({ total: 12, accepted: 5 });
    state.setDetailSegmentId(3);

    const next = usePopupStore.getState();
    expect(next.busy).toBe(true);
    expect(next.status).toBe("Scanning");
    expect(next.activeTabId).toBe(99);
    expect(next.activeHost).toBe("example.com");
    expect(next.scan).toEqual({ total: 12, accepted: 5 });
    expect(next.detailSegmentId).toBe(3);
  });

  it("replaces settings in one call", () => {
    const replacement = {
      ...DEFAULT_SETTINGS,
      topics: "react",
      autoScanEnabled: true,
      autoScanIntervalSec: 8,
    };

    usePopupStore.getState().replaceSettings(replacement);

    const next = usePopupStore.getState();
    expect(next.settings).toEqual(replacement);
  });
});
