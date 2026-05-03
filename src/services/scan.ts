import { lexicalTopicScore, normalizeLexicalScore, getMatchedKeywords, normalizeWhitespace } from "./filters";

export interface RawSegment {
  id: number;
  text: string;
  xpath: string;
}

export interface ScoredSegment extends RawSegment {
  score: number;
  lexicalScore: number;
  semanticScore: number | null;
  matchedTopics: string[];
  matchedKeywords: string[];
  selected: boolean;
  voice: string;
}

export interface ScanSettings {
  threshold: number;
  filterMode: "basic" | "ai";
  embeddingModel: string;
}

const DEFAULT_MAX_SEGMENTS = 80;
const DEFAULT_BATCH_SIZE = 40;

export function buildRawSignature(rawSegments: RawSegment[]): string {
  const sample = rawSegments
    .slice(0, 25)
    .map((segment) => `${segment.id}:${String(segment.text || "").slice(0, 80)}`)
    .join("|");
  return `${rawSegments.length}::${sample}`;
}

function truncateForEmbedding(text: string): string {
  const normalized = normalizeWhitespace(text);
  const maxChars = 1200;
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars)}...`;
}

function averageVectors(vectors: number[][]): number[] {
  if (!vectors.length) {
    return [];
  }

  const size = vectors[0].length;
  const sum = new Array(size).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < size; i += 1) {
      sum[i] += vector[i];
    }
  }

  return sum.map((value) => value / vectors.length);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function fetchEmbeddings(apiKey: string, model: string, texts: string[], batchSize: number): Promise<number[][]> {
  const vectors: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: chunk,
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`HTTP ${response.status}: ${bodyText.slice(0, 120)}`);
    }

    const data = (await response.json()) as { data?: Array<{ index: number; embedding: number[] }> };
    const arr = Array.isArray(data?.data) ? data.data : [];
    arr.sort((a, b) => a.index - b.index);
    for (const item of arr) {
      vectors.push(item.embedding);
    }
  }

  return vectors;
}

export async function applySemanticScores(
  inputSegments: ScoredSegment[],
  topics: string[],
  apiKey: string,
  model: string,
): Promise<ScoredSegment[]> {
  const ranked = [...inputSegments].sort((a, b) => b.lexicalScore - a.lexicalScore);
  const candidates = ranked.slice(0, DEFAULT_MAX_SEGMENTS);
  if (!candidates.length) {
    return inputSegments;
  }

  const topicEmbeddings = await fetchEmbeddings(apiKey, model, topics, DEFAULT_BATCH_SIZE);
  if (!topicEmbeddings.length) {
    return inputSegments;
  }

  const topicVector = averageVectors(topicEmbeddings);
  const candidateTexts = candidates.map((segment) => truncateForEmbedding(segment.text));
  const segmentEmbeddings = await fetchEmbeddings(apiKey, model, candidateTexts, DEFAULT_BATCH_SIZE);

  const semanticById = new Map<number, number>();
  for (let i = 0; i < candidates.length; i += 1) {
    const embedding = segmentEmbeddings[i];
    if (!embedding) {
      continue;
    }
    const similarity = cosineSimilarity(topicVector, embedding);
    semanticById.set(candidates[i].id, similarity);
  }

  return inputSegments.map((segment) => {
    const semantic = semanticById.get(segment.id);
    if (semantic == null) {
      return {
        ...segment,
        semanticScore: null,
        score: segment.lexicalScore,
      };
    }

    const semanticClamped = Math.max(0, semantic);
    const blended = 0.35 * segment.lexicalScore + 0.65 * semanticClamped;

    return {
      ...segment,
      semanticScore: Number(semanticClamped.toFixed(4)),
      score: Number(blended.toFixed(4)),
    };
  });
}

export async function processScanResult(input: {
  rawSegments: RawSegment[];
  topics: string[];
  topicCandidates: string[];
  settings: ScanSettings;
  apiKey: string;
  previousSegments?: ScoredSegment[];
}): Promise<{ segments: ScoredSegment[]; fallbackNote: string }> {
  const { rawSegments, topics, topicCandidates, settings, apiKey, previousSegments = [] } = input;
  const previousByXpath = new Map(previousSegments.map((segment) => [segment.xpath, segment]));

  const initialSegments: ScoredSegment[] = rawSegments.map((segment) => {
    const lexicalRaw = lexicalTopicScore(segment.text, topicCandidates);
    const lexical = normalizeLexicalScore(lexicalRaw);

    return {
      ...segment,
      score: topics.length ? lexical : 1,
      lexicalScore: lexical,
      semanticScore: null,
      matchedTopics: topics.filter((topic) => segment.text.toLowerCase().includes(topic.toLowerCase())),
      matchedKeywords: getMatchedKeywords(segment.text, topicCandidates),
      selected: previousByXpath.get(segment.xpath)?.selected ?? true,
      voice: previousByXpath.get(segment.xpath)?.voice ?? "",
    };
  });

  let scoredSegments = initialSegments;
  let fallbackNote = "";

  if (topics.length && settings.filterMode === "ai") {
    if (apiKey) {
      try {
        scoredSegments = await applySemanticScores(scoredSegments, topics, apiKey, settings.embeddingModel);
      } catch (error) {
        fallbackNote = ` (fallback lexical do lỗi embeddings: ${String((error as Error).message || error)})`;
      }
    } else {
      fallbackNote = " (AI mode thiếu API key nên dùng lọc cơ bản)";
    }
  }

  let filtered = topics.length
    ? scoredSegments.filter((segment) => segment.score >= settings.threshold)
    : scoredSegments;

  if (topics.length && !filtered.length && scoredSegments.length) {
    const relaxedThreshold = Math.max(0.2, Number((settings.threshold * 0.72).toFixed(3)));
    const relaxed = scoredSegments.filter(
      (segment) => segment.score >= relaxedThreshold || (segment.matchedKeywords?.length || 0) >= 2,
    );
    if (relaxed.length) {
      filtered = relaxed;
      fallbackNote += ` (không có kết quả ở ngưỡng ${settings.threshold}, tự nới xuống ${relaxedThreshold})`;
    }
  }

  const sorted = filtered.toSorted((a, b) => (b.score - a.score) || (a.id - b.id));
  return { segments: sorted, fallbackNote };
}
