import { describe, expect, it } from "vitest";

import { expandTopicCandidates, lexicalTopicScore, parseTopics } from "../../../src/services/filters";

describe("filters", () => {
  it("parses topics by comma/semicolon/newline", () => {
    const topics = parseTopics("ai, startup;thiền\nhealing");
    expect(topics).toEqual(["ai", "startup", "thiền", "healing"]);
  });

  it("expands candidates based on topic variants", () => {
    const candidates = expandTopicCandidates(["tâm linh"]);
    expect(candidates.length).toBeGreaterThan(1);
  });

  it("returns higher lexical score for matching text", () => {
    const good = lexicalTopicScore("Bai viet ve AI va startup", ["ai", "startup"]);
    const bad = lexicalTopicScore("Noi dung ve am nhac", ["ai", "startup"]);
    expect(good).toBeGreaterThan(bad);
  });

  it("does not match partial short token for short multi-word topics", () => {
    const score = lexicalTopicScore(
      "Tu ngay co AI, ro len trao luu lam app... bo ngang vi ko tien",
      ["tử vi"],
    );
    expect(score).toBe(0);
  });

  it("still matches exact short phrase topics", () => {
    const score = lexicalTopicScore("Noi dung noi ve tu vi va phong thuy", ["tử vi"]);
    expect(score).toBe(1);
  });
});
