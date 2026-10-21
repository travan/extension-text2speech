import { afterEach, describe, expect, it, vi } from "vitest";

import { buildRawSignature, processScanResult } from "../../../src/services/scan";

afterEach(() => vi.unstubAllGlobals());

describe("scan", () => {
  it("detects changes after the first 25 segments and 80 characters", () => {
    const initial = Array.from({ length: 30 }, (_, id) => ({ id, text: "x".repeat(100), xpath: `/${id}` }));
    const changed = initial.map((item) => ({ ...item }));
    changed[29].text += "new content";
    expect(buildRawSignature(changed)).not.toBe(buildRawSignature(initial));
  });

  it("scores a match to any requested topic without averaging unrelated topics", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [
        { index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] },
      ] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 0] }] }))));
    const result = await processScanResult({
      rawSegments: [{ id: 1, text: "Meaningful related content", xpath: "/a" }],
      topics: ["astronomy", "cooking"], topicCandidates: ["astronomy", "cooking"],
      settings: { threshold: 0.6, filterMode: "ai", embeddingModel: "test" }, apiKey: "test",
    });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].semanticScore).toBe(1);
    expect(result.fallbackNote).toBe("");
  });

  it("falls back explicitly on an incomplete embeddings response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))));
    const result = await processScanResult({
      rawSegments: [{ id: 1, text: "AI technology", xpath: "/a" }],
      topics: ["AI"], topicCandidates: ["AI"],
      settings: { threshold: 0.45, filterMode: "ai", embeddingModel: "test" }, apiKey: "test",
    });
    expect(result.fallbackNote).toContain("Invalid embeddings response");
    expect(result.segments[0].semanticScore).toBeNull();
  });
  it("builds stable raw signature shape", () => {
    const signature = buildRawSignature([
      { id: 1, text: "hello world", xpath: "/a" },
      { id: 2, text: "ai startup", xpath: "/b" },
    ]);
    expect(signature).toContain("2::");
  });

  it("filters segments using threshold", async () => {
    const result = await processScanResult({
      rawSegments: [
        { id: 1, text: "bai viet ve ai va startup", xpath: "/a" },
        { id: 2, text: "noi dung giai tri", xpath: "/b" },
      ],
      topics: ["ai", "startup"],
      topicCandidates: ["ai", "startup"],
      settings: { threshold: 0.45, filterMode: "basic", embeddingModel: "text-embedding-3-small" },
      apiKey: "",
    });

    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.segments[0].score).toBeGreaterThanOrEqual(0.45);
  });

  it("adds fallback note when ai mode has no api key", async () => {
    const result = await processScanResult({
      rawSegments: [{ id: 1, text: "bai viet ve ai", xpath: "/a" }],
      topics: ["ai"],
      topicCandidates: ["ai"],
      settings: { threshold: 0.45, filterMode: "ai", embeddingModel: "text-embedding-3-small" },
      apiKey: "",
    });

    expect(result.fallbackNote).toContain("AI mode");
  });
});
