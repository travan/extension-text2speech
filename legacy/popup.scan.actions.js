(() => {
  function mapRawSegments(rawSegments, previousSegments, topics, topicCandidates, settings, fns) {
    const previousByXpath = new Map(
      previousSegments.map((segment) => [segment.xpath, { selected: segment.selected, voice: segment.voice }])
    );

    return rawSegments.map((segment) => {
      const lexicalRaw = fns.lexicalTopicScore(segment.text, topicCandidates);
      const lexical = fns.normalizeLexicalScore(lexicalRaw, topics.length);
      const previous = previousByXpath.get(segment.xpath);

      return {
        ...segment,
        score: topics.length ? lexical : 1,
        lexicalScore: lexical,
        semanticScore: null,
        matchedTopics: topics.filter((topic) => segment.text.toLowerCase().includes(topic.toLowerCase())),
        matchedKeywords: fns.getMatchedKeywords(segment.text, topicCandidates),
        selected: previous?.selected ?? true,
        voice: previous?.voice ?? settings.defaultVoice ?? ""
      };
    });
  }

  async function applyAiScoring(input) {
    const {
      scoredSegments,
      topics,
      useAiMode,
      apiKey,
      settings,
      status,
      fns
    } = input;

    if (!topics.length || !useAiMode) {
      return { scoredSegments, fallbackNote: "" };
    }

    if (!apiKey) {
      return {
        scoredSegments,
        fallbackNote: " (AI mode thiếu API key nên dùng lọc cơ bản)"
      };
    }

    if (typeof status?.setText === "function") {
      status.setText("Đang tính semantic score bằng embeddings...");
    }

    try {
      const nextSegments = await fns.applySemanticScores(scoredSegments, topics, apiKey, settings.embeddingModel);
      return { scoredSegments: nextSegments, fallbackNote: "" };
    } catch (error) {
      return {
        scoredSegments,
        fallbackNote: ` (fallback lexical do lỗi embeddings: ${error.message})`
      };
    }
  }

  function applyRelaxedFallback(scoredSegments, topics, threshold) {
    let filtered = topics.length
      ? scoredSegments.filter((segment) => segment.score >= threshold)
      : scoredSegments;

    if (!topics.length || filtered.length || !scoredSegments.length) {
      return { filtered, fallbackNote: "" };
    }

    const relaxedThreshold = Math.max(0.2, Number((threshold * 0.72).toFixed(3)));
    const relaxed = scoredSegments.filter((segment) => (
      segment.score >= relaxedThreshold
      || (segment.matchedKeywords?.length || 0) >= 2
    ));

    if (!relaxed.length) {
      return { filtered, fallbackNote: "" };
    }

    filtered = relaxed;
    return {
      filtered,
      fallbackNote: ` (không có kết quả ở ngưỡng ${threshold}, tự nới xuống ${relaxedThreshold})`
    };
  }

  async function processScanResult(input) {
    const {
      rawSegments,
      previousSegments,
      topics,
      topicCandidates,
      settings,
      apiKey,
      useAiMode,
      status,
      fns
    } = input;

    const initialSegments = mapRawSegments(rawSegments, previousSegments, topics, topicCandidates, settings, fns);
    const aiResult = await applyAiScoring({
      scoredSegments: initialSegments,
      topics,
      useAiMode,
      apiKey,
      settings,
      status,
      fns
    });
    const fallbackResult = applyRelaxedFallback(aiResult.scoredSegments, topics, settings.threshold);

    const sorted = fallbackResult.filtered.sort((a, b) => (b.score - a.score) || (a.id - b.id));
    return {
      segments: sorted,
      fallbackNote: `${aiResult.fallbackNote}${fallbackResult.fallbackNote}`
    };
  }

  globalThis.PopupScanActions = {
    processScanResult
  };
})();
