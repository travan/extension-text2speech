import { afterEach, describe, expect, it, vi } from "vitest";
import { applyLocalAiScores, checkLocalModel, localAiUrl } from "../../../src/services/localAi";
import { processScanResult, type ScoredSegment } from "../../../src/services/scan";

const segment: ScoredSegment = {
  id: 1, text: "Mô hình học máy xử lý ngôn ngữ", xpath: "/a", score: 0,
  lexicalScore: 0, semanticScore: null, matchedTopics: [], matchedKeywords: [],
  selected: true, voice: "",
};
const reply = (scores: unknown) => new Response(JSON.stringify({
  message: { content: JSON.stringify({ scores }) },
}));

afterEach(() => vi.unstubAllGlobals());

describe("local AI", () => {
  it("diagnoses POST origin rejection before trying inference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));
    await expect(checkLocalModel("http://localhost:11434", "test")).rejects.toThrow("OLLAMA_ORIGINS");
  });

  it("rejects embedding-only models when checking the connection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ capabilities: ["embedding"] }))));
    await expect(checkLocalModel("http://localhost:11434", "test")).rejects.toThrow("chat/completion");
  });
  it.each(["https://example.com", "http://localhost.evil.test", "file:///tmp/model",
    "http://user:password@localhost:11434", "http://127.0.0.1:11434/proxy",
    "http://127.0.0.1:11434?key=secret"])("rejects non-local or ambiguous URL %s", (url) => {
    expect(() => localAiUrl(url, "/api/chat")).toThrow();
  });

  it("scores meaning without an API key and preserves user choices", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply([{ id: 1, score: 0.95 }]));
    vi.stubGlobal("fetch", fetcher);
    const result = await applyLocalAiScores([segment], ["AI"], "http://localhost:11434", "test");
    expect(result[0]).toMatchObject({ score: 0.95, semanticScore: 0.95, selected: true });
    const options = fetcher.mock.calls[0][1];
    expect(options.headers).not.toHaveProperty("Authorization");
    expect(options.redirect).toBe("error");
    expect(JSON.parse(options.body)).toMatchObject({ stream: false, think: false });
  });

  it.each([
    [], [{ id: 2, score: 0.9 }], [{ id: 1, score: 4 }], [{ id: 1, score: "0.9" }],
  ])("rejects malformed scores %j", async (scores) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(scores)));
    await expect(applyLocalAiScores([segment], ["AI"], "http://localhost:11434", "test")).rejects.toThrow();
  });

  it("rejects duplicate ids", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply([{ id: 1, score: 1 }, { id: 1, score: 0 }])));
    await expect(applyLocalAiScores([segment, { ...segment, id: 2 }], ["AI"], "http://localhost:11434", "test")).rejects.toThrow();
  });

  it("falls back explicitly when the server is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await processScanResult({
      rawSegments: [{ id: 1, text: "AI technology", xpath: "/a" }],
      topics: ["AI"], topicCandidates: ["AI"], apiKey: "must-not-be-sent",
      settings: { filterMode: "local", threshold: 0.45, embeddingModel: "" },
    });
    expect(result.fallbackNote).toContain("dùng lọc cơ bản");
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].semanticScore).toBeNull();
  });

  it("does not silently relax the local AI threshold on irrelevant text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply([{ id: 1, score: 0.34 }])));
    const result = await processScanResult({
      rawSegments: [segment], topics: ["AI"], topicCandidates: ["AI"], apiKey: "",
      settings: { filterMode: "local", threshold: 0.45, embeddingModel: "" },
    });
    expect(result.segments).toEqual([]);
    expect(result.fallbackNote).not.toContain("nới");
  });

  it("batches at eight and caps AI work at forty segments", async () => {
    const fetcher = vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body);
      const { excerpts } = JSON.parse(request.messages[1].content);
      return reply(excerpts.map(({ id }: { id: number }) => ({ id, score: 0.9 })));
    });
    vi.stubGlobal("fetch", fetcher);
    const segments = Array.from({ length: 41 }, (_, i) => ({ ...segment, id: i }));
    const result = await applyLocalAiScores(segments, ["AI"], "http://localhost:11434", "test");
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(result.filter((item) => item.semanticScore !== null)).toHaveLength(40);
    expect(result[40].score).toBe(0);
  });
});
