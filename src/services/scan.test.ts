import { describe, expect, it } from "vitest";

import { buildRawSignature, processScanResult } from "./scan";

describe("scan", () => {
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
