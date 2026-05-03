import { describe, expect, it } from "vitest";

import { expandTopicCandidates, lexicalTopicScore, parseTopics } from "./filters";

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
});
