import { afterEach, expect, it, vi } from "vitest";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { applyLocalAiScores, checkLocalModel } from "../../src/services/localAi";
import { processScanResult, type ScoredSegment } from "../../src/services/scan";

const servers: Server[] = [];
const timers: NodeJS.Timeout[] = [];
async function listen(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return "http://127.0.0.1:" + (server.address() as AddressInfo).port;
}
const segment: ScoredSegment = {
  id: 1, text: "AI technology for language understanding", xpath: "/a",
  score: 1, lexicalScore: 1, semanticScore: null, matchedTopics: [], matchedKeywords: [], selected: true, voice: "",
};
afterEach(async () => {
  vi.restoreAllMocks();
  timers.splice(0).forEach(clearTimeout);
  await Promise.all(servers.splice(0).map(async (server) => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }));
});

it("real HTTP aborts a slow response body, not just the initial connection", async () => {
  const url = await listen((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.flushHeaders();
    timers.push(setTimeout(() => response.end('{"message":{"content":"{}"}}'), 1000));
  });
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => nativeTimeout(100));
  // Only the deadline is shortened. Fetch, sockets, headers and body reads are real.
  const started = performance.now();
  await expect(applyLocalAiScores([segment], ["AI"], url, "fixture")).rejects.toMatchObject({ name: "TimeoutError" });
  expect(timeout).toHaveBeenCalledWith(120000);
  expect(performance.now() - started).toBeLessThan(1500);
});

it("real HTTP redirect is refused before a second endpoint receives content", async () => {
  const paths: string[] = [];
  const url = await listen((request, response) => {
    paths.push(request.url!);
    response.writeHead(307, { Location: "/should-not-be-called" });
    response.end();
  });
  await expect(applyLocalAiScores([segment], ["AI"], url, "fixture")).rejects.toThrow();
  expect(paths).toEqual(["/api/chat"]);
});

it("real HTTP 403 reports origin configuration rather than a successful connection", async () => {
  const url = await listen((_request, response) => { response.writeHead(403); response.end(); });
  await expect(checkLocalModel(url, "fixture")).rejects.toThrow("OLLAMA_ORIGINS");
});

it("a real socket reset after batch one yields a complete lexical fallback", async () => {
  let requests = 0;
  const authorization: Array<string | undefined> = [];
  const url = await listen((request, response) => {
    requests++;
    authorization.push(request.headers.authorization);
    if (requests === 2) { request.socket.destroy(); return; }
    let data = "";
    request.on("data", (chunk) => { data += chunk; });
    request.on("end", () => {
      const excerpts = JSON.parse(JSON.parse(data).messages[1].content).excerpts;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ message: { content: JSON.stringify({
        scores: excerpts.map(({ id }: { id: number }) => ({ id, score: 0 })),
      }) } }));
    });
  });
  const result = await processScanResult({
    rawSegments: Array.from({ length: 9 }, (_, i) => ({ ...segment, id: i + 1, xpath: "/" + i })),
    topics: ["AI"], topicCandidates: ["AI"], apiKey: "never-send-this-key",
    settings: { filterMode: "local", threshold: 0.45, embeddingModel: "", localAiUrl: url, localAiModel: "fixture" },
  });
  expect(requests).toBe(2);
  expect(authorization).toEqual([undefined, undefined]);
  expect(result.segments).toHaveLength(9);
  expect(result.segments.every((s) => s.semanticScore === null && s.score === 1)).toBe(true);
  expect(result.fallbackNote).toContain("dùng lọc cơ bản");
});
