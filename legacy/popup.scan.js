(() => {
  const DEFAULT_MAX_SEGMENTS = 80;
  const DEFAULT_BATCH_SIZE = 40;

  function buildRawSignature(rawSegments) {
    const sample = rawSegments
      .slice(0, 25)
      .map((segment) => `${segment.id}:${String(segment.text || "").slice(0, 80)}`)
      .join("|");
    return `${rawSegments.length}::${sample}`;
  }

  async function applySemanticScores(inputSegments, topics, apiKey, model, options = {}) {
    const maxSegments = Number(options.maxSegments) || DEFAULT_MAX_SEGMENTS;
    const batchSize = Number(options.batchSize) || DEFAULT_BATCH_SIZE;

    const ranked = [...inputSegments].sort((a, b) => b.lexicalScore - a.lexicalScore);
    const candidates = ranked.slice(0, maxSegments);
    if (!candidates.length) return inputSegments;

    const topicEmbeddings = await fetchEmbeddings(apiKey, model, topics, batchSize);
    if (!topicEmbeddings.length) return inputSegments;

    const topicVector = averageVectors(topicEmbeddings);
    const candidateTexts = candidates.map((segment) => truncateForEmbedding(segment.text));
    const segmentEmbeddings = await fetchEmbeddings(apiKey, model, candidateTexts, batchSize);

    const semanticById = new Map();
    for (let i = 0; i < candidates.length; i += 1) {
      const embedding = segmentEmbeddings[i];
      if (!embedding) continue;
      const similarity = cosineSimilarity(topicVector, embedding);
      semanticById.set(candidates[i].id, similarity);
    }

    return inputSegments.map((segment) => {
      const semantic = semanticById.get(segment.id);
      if (semantic == null) {
        return {
          ...segment,
          semanticScore: null,
          score: segment.lexicalScore
        };
      }

      const semanticClamped = Math.max(0, semantic);
      const blended = 0.35 * segment.lexicalScore + 0.65 * semanticClamped;

      return {
        ...segment,
        semanticScore: Number(semanticClamped.toFixed(4)),
        score: Number(blended.toFixed(4))
      };
    });
  }

  async function fetchEmbeddings(apiKey, model, texts, batchSize) {
    const vectors = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const chunk = texts.slice(i, i + batchSize);
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          input: chunk
        })
      });

      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`HTTP ${response.status}: ${bodyText.slice(0, 120)}`);
      }

      const data = await response.json();
      const arr = Array.isArray(data?.data) ? data.data : [];
      arr.sort((a, b) => a.index - b.index);
      for (const item of arr) {
        vectors.push(item.embedding);
      }
    }

    return vectors;
  }

  function truncateForEmbedding(text) {
    const normalizeWhitespace = globalThis.PopupFilters?.normalizeWhitespace || ((v) => String(v || "").trim());
    const normalized = normalizeWhitespace(text);
    const maxChars = 1200;
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars)}...`;
  }

  function averageVectors(vectors) {
    if (!vectors.length) return [];

    const size = vectors[0].length;
    const sum = new Array(size).fill(0);

    for (const vector of vectors) {
      for (let i = 0; i < size; i += 1) {
        sum[i] += vector[i];
      }
    }

    return sum.map((value) => value / vectors.length);
  }

  function cosineSimilarity(a, b) {
    if (!a.length || !b.length || a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  globalThis.PopupScan = {
    buildRawSignature,
    applySemanticScores
  };
})();
