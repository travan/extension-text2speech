import { afterAll, beforeAll, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyLocalAiScores, DEFAULT_LOCAL_AI_MODEL, DEFAULT_LOCAL_AI_URL, localAiUrl } from "../../src/services/localAi";
import { processScanResult } from "../../src/services/scan";
import { expandTopicCandidates } from "../../src/services/filters";

type Row = [boolean, "vi" | "en", string, string];
const corpusBytes = readFileSync("tests/fixtures/relevance-v1.json");
const corpus = JSON.parse(corpusBytes.toString()) as {
  version: string; labelPolicy: string; groups: Array<{ id: string; topics: string[]; rows: Row[] }>;
};
const model = process.env.LOCAL_AI_MODEL || DEFAULT_LOCAL_AI_MODEL;
const url = process.env.LOCAL_AI_URL || DEFAULT_LOCAL_AI_URL;
const threshold = 0.45;
const gates = { precision: 0.9, recall: 0.9, perGroupAccuracy: 0.75, agreement: 0.95 };
type Prediction = {
  id: string; expected: boolean; language: string; category: string; text: string;
  basic: boolean; local: boolean; score: number | null;
};
type Run = { group: string; repeat: number; topics: string[]; durationMs: number; rows: Prediction[]; error?: string };
const runs: Run[] = [];
let modelMetadata: unknown;
const startedAt = new Date().toISOString();

function metrics(rows: Prediction[], field: "local" | "basic") {
  const tp = rows.filter((r) => r.expected && r[field]).length;
  const fp = rows.filter((r) => !r.expected && r[field]).length;
  const fn = rows.filter((r) => r.expected && !r[field]).length;
  const tn = rows.filter((r) => !r.expected && !r[field]).length;
  return { tp, fp, fn, tn, total: rows.length, accuracy: (tp + tn) / (rows.length || 1),
    precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1), f1: 2 * tp / (2 * tp + fp + fn || 1) };
}
function summary() {
  const rows = runs.flatMap((r) => r.rows);
  const first = new Map(runs.filter((r) => r.repeat === 0).flatMap((r) => r.rows.map((row) => [row.id, row] as const)));
  const second = runs.filter((r) => r.repeat === 1).flatMap((r) => r.rows);
  const disagreements = second.filter((r) => first.get(r.id)?.local !== r.local).map((r) => r.id);
  const durations = runs.map((r) => r.durationMs).sort((a, b) => a - b);
  return {
    basic: metrics(rows, "basic"), local: metrics(rows, "local"),
    agreement: second.length ? 1 - disagreements.length / second.length : 0, disagreements,
    latencyMs: { median: durations[Math.floor(durations.length / 2)], p95: durations[Math.ceil(durations.length * 0.95) - 1] },
    byGroup: Object.fromEntries(corpus.groups.map((g) => [g.id, metrics(runs.filter((r) => r.group === g.id).flatMap((r) => r.rows), "local")])),
    byLanguage: Object.fromEntries(["vi", "en"].map((language) => [language, metrics(rows.filter((r) => r.language === language), "local")])),
    byCategory: Object.fromEntries([...new Set(rows.map((r) => r.category))].map((category) =>
      [category, metrics(rows.filter((r) => r.category === category), "local")])),
    errors: runs.filter((r) => r.error).map(({ group, repeat, error }) => ({ group, repeat, error })),
    mistakes: runs.flatMap((r) => r.rows.filter((row) => row.local !== row.expected).map((row) => ({ group: r.group, repeat: r.repeat, ...row }))),
  };
}

beforeAll(async () => {
  const response = await fetch(localAiUrl(url, "/api/tags"), { signal: AbortSignal.timeout(5000) });
  expect(response.ok).toBe(true);
  const body = await response.json();
  modelMetadata = body.models.find((item: { name: string }) => item.name === model);
  expect(modelMetadata).toBeTruthy();
});

for (const repeat of [0, 1]) {
  for (const fixture of corpus.groups) {
    it("real model / " + fixture.id + " / order " + (repeat === 0 ? "forward" : "reverse"), async () => {
      const raw = fixture.rows.map(([, , , text], index) => ({ id: index + 1, text, xpath: "/p[" + (index + 1) + "]" }));
      if (repeat) raw.reverse();
      const input = {
        rawSegments: raw, topics: fixture.topics, topicCandidates: expandTopicCandidates(fixture.topics), apiKey: "",
        settings: { threshold, filterMode: "basic" as const, embeddingModel: "" },
      };
      const basic = await processScanResult(input);
      const all = await processScanResult({ ...input, settings: { ...input.settings, threshold: 0 } });
      if (repeat) all.segments.reverse();
      const started = performance.now();
      const run: Run = { group: fixture.id, repeat, topics: fixture.topics, durationMs: 0, rows: [] };
      runs.push(run);
      try {
        // Real HTTP inference through the production ranking service. No fetch/Chrome mocks.
        const scored = await applyLocalAiScores(all.segments, fixture.topics, url, model);
        const basicIds = new Set(basic.segments.map((s) => s.id));
        run.rows = fixture.rows.map(([expected, language, category, text], index) => {
          const segment = scored.find((s) => s.id === index + 1)!;
          return { id: fixture.id + "-" + (index + 1), expected, language, category, text,
            basic: basicIds.has(index + 1), local: segment.score >= threshold, score: segment.semanticScore };
        });
        expect(scored.every((s) => s.semanticScore !== null)).toBe(true);
        expect(metrics(run.rows, "local").accuracy).toBeGreaterThanOrEqual(gates.perGroupAccuracy);
      } catch (error) {
        run.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        run.durationMs = Math.round(performance.now() - started);
        console.log(JSON.stringify({ group: run.group, repeat, durationMs: run.durationMs, metrics: metrics(run.rows, "local"), error: run.error }));
      }
    }, 130000);
  }
}

it("meets the predeclared overall quality and order-stability gates", () => {
  const result = summary();
  expect(result.errors).toEqual([]);
  expect(result.local.total).toBe(192);
  expect(result.local.precision).toBeGreaterThanOrEqual(gates.precision);
  expect(result.local.recall).toBeGreaterThanOrEqual(gates.recall);
  expect(result.agreement).toBeGreaterThanOrEqual(gates.agreement);
});

afterAll(() => {
  const directory = resolve(process.env.VERIFICATION_DIR || "test-results");
  mkdirSync(directory, { recursive: true });
  const report = {
    startedAt, endedAt: new Date().toISOString(), model, url, modelMetadata, threshold, gates,
    corpus: { version: corpus.version, sha256: createHash("sha256").update(corpusBytes).digest("hex"),
      uniqueExamples: 96, repeats: 2, labelPolicy: corpus.labelPolicy,
      limitation: "Agent-authored synthetic fixtures, not independent human labels or live social feeds. Ranker-level real network test; browser integration is measured separately." },
    ...summary(), runs,
  };
  writeFileSync(resolve(directory, "relevance-benchmark.json"), JSON.stringify(report, null, 2));
});
