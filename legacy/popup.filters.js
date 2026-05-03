(() => {
  const STOP_WORDS = new Set([
    "và", "là", "của", "cho", "với", "một", "những", "các", "được", "trong", "khi", "này", "đó", "đang", "đến",
    "the", "is", "are", "to", "of", "for", "on", "in"
  ]);

  const TOPIC_VARIANTS = {
    "tam linh": ["ma", "quy", "coi am", "tu vi", "phong thuy", "xem boi", "tam linh"],
    "thien dinh": ["chanh niem", "mindfulness", "hoi tho", "tap trung", "an dinh"],
    "chua lanh": ["healing", "tri lieu", "tu yeu thuong", "lanh thuong"],
    "nang luong": ["tan so", "chakra", "nang luong tich cuc", "truong nang luong"]
  };

  function parseTopics(input) {
    const rawParts = String(input || "")
      .split(/[,;\n]/)
      .map((part) => part.trim())
      .filter(Boolean);

    return [...new Set(rawParts)];
  }

  function normalizeWhitespace(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function normalizeTopicKey(topic) {
    return normalizeWhitespace(topic)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeForMatch(text) {
    return normalizeTopicKey(text);
  }

  function expandTopicCandidates(topics) {
    const expanded = [];

    for (const topic of topics) {
      expanded.push(topic);
      const normalized = normalizeTopicKey(topic);

      for (const [seed, variants] of Object.entries(TOPIC_VARIANTS)) {
        if (!normalized) continue;
        if (!normalized.includes(seed) && !seed.includes(normalized)) continue;
        expanded.push(...variants);
      }
    }

    return [...new Set(expanded.map((item) => normalizeWhitespace(item)).filter(Boolean))];
  }

  function textToTokens(text) {
    return normalizeForMatch(text)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  }

  function hasApproxTokenMatch(textTokens, token) {
    if (textTokens.has(token)) return true;
    if (token.length < 4) return false;

    for (const textToken of textTokens) {
      if (textToken.startsWith(token) || token.startsWith(textToken)) return true;
      if (textToken.includes(token) || token.includes(textToken)) return true;
    }

    return false;
  }

  function lexicalTopicScore(text, topics) {
    const textTokens = new Set(textToTokens(text));
    const normalizedText = normalizeForMatch(text);
    if (!textTokens.size || !topics.length) return 0;

    let best = 0;
    for (const topic of topics) {
      const normalizedTopic = normalizeForMatch(topic);
      const topicTokens = textToTokens(topic);
      if (!topicTokens.length) continue;

      if (normalizedText.includes(normalizedTopic)) {
        best = Math.max(best, 1);
        continue;
      }

      let matched = 0;
      for (const token of topicTokens) {
        if (hasApproxTokenMatch(textTokens, token)) matched += 1;
      }
      if (!matched) continue;

      const ratio = matched / topicTokens.length;
      const boosted = 0.5 + 0.5 * ratio;
      best = Math.max(best, Math.min(1, boosted));
    }

    return Number(best.toFixed(4));
  }

  function getMatchedKeywords(text, topics) {
    const textTokens = new Set(textToTokens(text));
    const normalizedText = normalizeForMatch(text);
    const hits = [];

    for (const topic of topics) {
      const normalizedTopic = normalizeForMatch(topic);
      if (normalizedText.includes(normalizedTopic)) {
        hits.push(topic);
      }

      const topicTokens = textToTokens(topic);
      for (const token of topicTokens) {
        if (hasApproxTokenMatch(textTokens, token)) hits.push(token);
      }
    }

    return [...new Set(hits)].slice(0, 8);
  }

  function normalizeLexicalScore(rawScore, topicsCount) {
    if (!topicsCount) return 0;
    return Math.max(0, Math.min(1, rawScore));
  }

  function hostFromUrl(url) {
    if (!url) return null;
    if (!URL.canParse(url)) {
      return null;
    }
    const parsed = new URL(url);
    return parsed.hostname || null;
  }

  globalThis.PopupFilters = {
    parseTopics,
    normalizeWhitespace,
    normalizeTopicKey,
    normalizeForMatch,
    expandTopicCandidates,
    textToTokens,
    hasApproxTokenMatch,
    lexicalTopicScore,
    getMatchedKeywords,
    normalizeLexicalScore,
    hostFromUrl
  };
})();
