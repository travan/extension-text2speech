import { expandTopicCandidates, lexicalTopicScore, getMatchedKeywords, normalizeWhitespace, normalizeForMatch, textToTokens, hasApproxTokenMatch, parseTopics as parseTopicInput } from "../../services/filters";

const MIN_TEXT_LENGTH = 30;
const MAX_TEXT_LENGTH = 1600;
const MAX_CAPTURE_ITEMS = 5000;

const THREAD_SELECTOR = [
  "article",
  "[role='article']",
  "div[role='article']",
  "[data-pressable-container='true']",
  "[data-ad-preview='message']",
  "[data-testid='post_message']",
].join(",");
const CONTENT_CONTAINER_SELECTOR = [
  "article",
  "[role='article']",
  "div[role='article']",
  "[data-pressable-container='true']",
  "[data-ad-preview='message']",
  "[data-testid='post_message']",
].join(",");
const BLOCK_SELECTOR = ["article", "p", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6"].join(",");
const FALLBACK_BLOCK_SELECTOR = [
  "article",
  "[role='article']",
  "section",
  "p",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "span",
].join(",");

const EXPANDABLE_TEXT_MATCHERS = [
  "xem them", "xem thêm", "mo rong", "mở rộng", "hien thi them", "hiển thị thêm",
  "doc them", "đọc thêm", "read more", "see more", "show more",
];

const NON_CONTENT_ACTION_MATCHERS = [
  "comment", "binh luan", "bình luận", "reply", "tra loi", "trả lời",
  "menu", "share", "chia sẻ", "follow", "theo dõi", "like", "repost",
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawSegment {
  id: number;
  text: string;
  xpath: string;
}

interface CaptureRecord {
  key: string;
  capturedAt: number;
  id: number;
  text: string;
  xpath: string;
  score: number;
  matchedKeywords: string[];
  firstSeenAt: number;
  lastSeenAt: number;
}

interface CaptureState {
  active: boolean;
  tabId: number | null;
  storageKey: string | null;
  topics: string[];
  threshold: number;
  topicsExpanded: string[];
  observer: MutationObserver | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  intervalTimer: ReturnType<typeof setInterval> | null;
  onScroll: (() => void) | null;
  records: Map<string, CaptureRecord>;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function toFoldedText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Topic helpers ────────────────────────────────────────────────────────────

function parseTopics(input: string | string[]): string[] {
  return parseTopicInput(Array.isArray(input) ? input.join(",") : input);
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function looksLikeExpandControl(text: string): boolean {
  const folded = toFoldedText(normalizeWhitespace(text));
  if (!folded) return false;
  return EXPANDABLE_TEXT_MATCHERS.some((keyword) => folded.includes(keyword));
}

function looksLikeNonContentAction(text: string): boolean {
  const folded = toFoldedText(normalizeWhitespace(text));
  if (!folded) return false;
  return NON_CONTENT_ACTION_MATCHERS.some((keyword) => folded.includes(keyword));
}

function isElementVisibleForInteraction(element: Element): boolean {
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function expandHiddenTextInTree(root: Element): void {
  const allNodes = [root, ...root.querySelectorAll("*")];
  for (const node of allNodes) {
    if (!(node instanceof HTMLElement)) continue;
    const computed = getComputedStyle(node);
    const style = node.style;
    if (computed.maxHeight && computed.maxHeight !== "none") style.maxHeight = "none";
    if (computed.overflow === "hidden") style.overflow = "visible";
    if (computed.overflowY === "hidden") style.overflowY = "visible";
    if ((computed as unknown as Record<string, string>).webkitLineClamp && (computed as unknown as Record<string, string>).webkitLineClamp !== "none") {
      (style as unknown as Record<string, string>).webkitLineClamp = "unset";
    }
  }
}

function extractTextForNode(node: Element): string {
  const clone = node.cloneNode(true);
  if (!(clone instanceof Element)) return normalizeWhitespace(node.textContent ?? "");
  expandHiddenTextInTree(clone);

  const fullRaw = normalizeWhitespace((node as HTMLElement).innerText ?? "") || normalizeWhitespace(clone.textContent ?? "");
  const bodyOnly = extractBodyTextFromThreadsFeedRoot(node);
  const raw = findThreadsFeedRoot(node)
    ? (bodyOnly || fullRaw)
    : bodyOnly.length >= Math.max(MIN_TEXT_LENGTH, Math.floor(fullRaw.length * 0.35))
      ? bodyOnly
      : fullRaw;
  return sanitizeExtractedText(raw);
}

function findThreadsFeedRoot(node: Element): HTMLElement | null {
  const candidate = node.closest("[data-pagelet^='threads_feed_'], [data_pagelet^='threads_feed_']");
  return candidate instanceof HTMLElement ? candidate : null;
}

function isLikelyThreadsContentChild(node: Element): boolean {
  const container = node.matches(CONTENT_CONTAINER_SELECTOR)
    ? node
    : node.querySelector(CONTENT_CONTAINER_SELECTOR);
  if (container && isVisible(container)) {
    const text = normalizeWhitespace((container as HTMLElement).innerText || container.textContent || "");
    if (text.length >= MIN_TEXT_LENGTH) {
      return true;
    }
  }

  const spanText = normalizeWhitespace(
    [...node.querySelectorAll("span")]
      .map((span) => (span as HTMLElement).innerText || span.textContent || "")
      .join(" "),
  );
  return spanText.length >= MIN_TEXT_LENGTH;
}

function isLikelyThreadsListNode(node: Element): boolean {
  if (node.children.length <= 3) return false;

  const candidateChildren = [...node.children].slice(2);
  if (candidateChildren.length < 2) return false;

  const contentLikeChildren = candidateChildren.filter((child) => isLikelyThreadsContentChild(child));
  return contentLikeChildren.length >= Math.min(2, candidateChildren.length);
}

function findDeepNodeWithManyChildren(node: Element): Element | null {
  // Đi theo spine chính của feed wrapper, nhưng chỉ dừng khi node đó
  // thực sự giống list chứa các post card sau index 2.
  let current: Element = node;
  while (true) {
    if (isLikelyThreadsListNode(current)) {
      return current;
    }

    if (current.children.length === 0) return null;

    const next = current.children[0];
    if (!(next instanceof Element)) return null;
    if (next === current) return null;

    if (current.children.length > 3 && !isLikelyThreadsListNode(current)) {
      current = next;
      continue;
    }

    current = next;
  }
}

function extractTextFromThreadsChild(child: Element): string {
  const spanTexts = [...child.querySelectorAll("span")]
    .map((span) => normalizeWhitespace((span as HTMLElement).innerText || span.textContent || ""))
    .filter(Boolean);

  if (spanTexts.length) {
    const mergedSpan = normalizeWhitespace(spanTexts.join(" "));
    if (mergedSpan.length >= 16) return mergedSpan;
  }

  return normalizeWhitespace((child as HTMLElement).innerText || child.textContent || "");
}

function isLikelyContentSpanText(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return false;

  // Ignore pure counters or separators like "1", "1/2", "3 3".
  if (/^[\d\s.,/kKmM]+$/.test(normalized)) return false;

  const folded = toFoldedText(normalized);
  if (NON_CONTENT_ACTION_MATCHERS.some((item) => folded.includes(toFoldedText(item)))) return false;
  if (["translate", "xem ban dich", "xem bản dịch"].some((item) => folded.includes(toFoldedText(item)))) return false;

  return true;
}

function findChildOrGrandchildWithMoreThanTwoChildren(parent: Element): Element | null {
  for (const child of parent.children) {
    if (child.children.length > 2) return child;
  }

  for (const child of parent.children) {
    for (const grandchild of child.children) {
      if (grandchild.children.length > 2) return grandchild;
    }
  }

  return null;
}

function extractSpanContentFromNodeChildrenFromIndex(node: Element, startIndex = 2): string {
  const selectedChildren = [...node.children].slice(startIndex);
  if (!selectedChildren.length) return "";

  const parts: string[] = [];
  for (const child of selectedChildren) {
    const spans = child.querySelectorAll("span");
    if (!spans.length) {
      const fallback = normalizeWhitespace((child as HTMLElement).innerText || child.textContent || "");
      if (fallback && isLikelyContentSpanText(fallback)) {
        parts.push(fallback);
      }
      continue;
    }

    for (const span of spans) {
      const value = normalizeWhitespace((span as HTMLElement).innerText || span.textContent || "");
      if (isLikelyContentSpanText(value)) {
        parts.push(value);
      }
    }
  }

  return normalizeWhitespace(parts.join(" "));
}

function findScopedThreadsChildForNode(contentBase: Element, node: Element, startIndex = 2): Element | null {
  const selectedChildren = [...contentBase.children].slice(startIndex);
  if (!selectedChildren.length) return null;

  const closestContainer = node.closest(CONTENT_CONTAINER_SELECTOR);
  for (const child of selectedChildren) {
    if (child === node || child.contains(node) || node.contains(child)) {
      return child;
    }
    if (closestContainer && (child === closestContainer || child.contains(closestContainer))) {
      return child;
    }
  }

  return null;
}

function extractBodyTextFromThreadsFeedRoot(node: Element): string {
  const root = findThreadsFeedRoot(node);
  if (!root) return "";

  const spineNode = findDeepNodeWithManyChildren(root) ?? root;
  const contentBase = findChildOrGrandchildWithMoreThanTwoChildren(spineNode);
  if (!contentBase) return "";

  const scopedChild = findScopedThreadsChildForNode(contentBase, node, 2);
  if (scopedChild) {
    return extractSpanContentFromNodeChildrenFromIndex(scopedChild, 0);
  }

  return extractSpanContentFromNodeChildrenFromIndex(contentBase, 2);
}

function sanitizeExtractedText(text: string): string {
  const actionWords = NON_CONTENT_ACTION_MATCHERS.map((item) => toFoldedText(item));
  const translationWords = ["dich", "translate", "see translation", "xem ban dich", "xem bản dịch"];
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .filter((line) => {
      if (line.length <= 26) {
        const folded = toFoldedText(line);
        if (actionWords.some((word) => folded.includes(word))) {
          return false;
        }
      }

      if (/^[\d\s.,/kKmM]+$/.test(line)) {
        return false;
      }

      const folded = toFoldedText(line);
      if (translationWords.some((word) => folded.includes(word))) {
        return false;
      }

      return true;
    });

  const merged = normalizeWhitespace(lines.join(" "));

  // Trim trailing social counters often rendered after body text on Threads.
  const withoutSlashCounters = merged.replace(/\s+\d+\s*\/\s*\d+(?:\s+\d+){0,4}$/g, "");
  const withoutNumberTail = withoutSlashCounters.replace(/(?:\s+\d+){2,6}$/g, "");
  return normalizeWhitespace(withoutNumberTail);
}

function findThreadContainer(element: Element): Element | null {
  return element.closest(CONTENT_CONTAINER_SELECTOR);
}

function getNodeDepthWithin(base: Element, node: Element): number {
  let depth = 0;
  let current: Element | null = node;

  while (current && current !== base) {
    depth += 1;
    current = current.parentElement;
  }

  return current === base ? depth : -1;
}

function chooseFocusedThreadContentNode(node: Element): Element {
  const base = findThreadContainer(node) ?? node;
  const descendants = [...base.querySelectorAll("div")];
  if (!descendants.length) {
    return base;
  }

  let bestNode: Element = base;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of descendants.slice(0, 180)) {
    if (!(candidate instanceof HTMLElement)) continue;
    if (!isVisible(candidate)) continue;

    const depth = getNodeDepthWithin(base, candidate);
    if (depth < 0) continue;

    const rawText = normalizeWhitespace(candidate.innerText || candidate.textContent || "");
    if (rawText.length < MIN_TEXT_LENGTH) continue;

    const folded = toFoldedText(rawText);
    const spanCount = candidate.querySelectorAll("span").length;
    const hasMedia = candidate.querySelector("img, video, canvas") ? 1 : 0;
    const actionPenalty = looksLikeNonContentAction(rawText.slice(0, 64)) ? 180 : 0;
    const textScore = Math.min(rawText.length, 1200);
    const depthBonus = depth * 14;
    const spanBonus = Math.min(spanCount, 40) * 10;
    const mediaPenalty = hasMedia ? 120 : 0;
    const metaPenalty = /\b\d+\s*(gio|giờ|h|m|phut|phút)\b/.test(folded) ? 120 : 0;
    const basePenalty = candidate === base ? 260 : 0;
    const score = textScore + depthBonus + spanBonus - mediaPenalty - actionPenalty - metaPenalty - basePenalty;

    if (score > bestScore) {
      bestScore = score;
      bestNode = candidate;
    }
  }

  return bestNode;
}

function findBestContentRoot(node: Element): Element {
  const directContainer = node.closest(CONTENT_CONTAINER_SELECTOR);
  if (directContainer && isVisible(directContainer)) {
    return directContainer;
  }

  let best = node;
  let bestLength = extractTextForNode(node).length;

  let current: Element | null = node.parentElement;
  let depth = 0;
  while (current && depth < 8) {
    if (isVisible(current)) {
      const text = extractTextForNode(current);
      const length = text.length;
      if (length >= MIN_TEXT_LENGTH && length <= 3000 && length > bestLength) {
        best = current;
        bestLength = length;
      }
    }
    current = current.parentElement;
    depth += 1;
  }

  return best;
}

function findExpandableControls(): Element[] {
  const selectors = [
    "button", "a", "summary", "[role='button']",
    "[aria-expanded='false']", "[data-testid*='see_more']", "[data-testid*='show_more']",
  ].join(",");

  const controls: Element[] = [];
  for (const element of document.querySelectorAll(selectors)) {
    if (!isElementVisibleForInteraction(element)) continue;
    if (element instanceof HTMLButtonElement && element.disabled) continue;
    const container = findThreadContainer(element);
    if (!container) continue;
    const containerTextLength = normalizeWhitespace(container.textContent ?? "").length;
    if (containerTextLength < MIN_TEXT_LENGTH) continue;

    const label = normalizeWhitespace(
      element.getAttribute("aria-label")
      ?? element.getAttribute("title")
      ?? element.textContent
      ?? "",
    );
    if (!label || label.length > 40) continue;
    if (looksLikeNonContentAction(label)) continue;
    if (!looksLikeExpandControl(label)) continue;
    controls.push(element);
  }
  return controls;
}

async function clickExpandableControls(maxRounds = 3): Promise<void> {
  for (let round = 0; round < maxRounds; round += 1) {
    const controls = findExpandableControls();
    if (!controls.length) break;

    let clicked = 0;
    for (const element of controls.slice(0, 80)) {
      try {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: globalThis as unknown as Window }));
        clicked += 1;
      } catch {
        // best effort
      }
    }
    if (!clicked) break;
    await wait(160);
    await wait(160);
  }
}

async function autoScrollForLazyLoad(maxSteps = 7): Promise<void> {
  const doc = document.documentElement;
  if (!doc) return;

  const stepPx = Math.max(360, Math.floor((globalThis.innerHeight || 800) * 0.9));
  let previousHeight = doc.scrollHeight;
  let stableRounds = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    globalThis.scrollBy(0, stepPx);
    await wait(260);

    const currentHeight = doc.scrollHeight;
    if (currentHeight <= previousHeight + 20) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
    }

    previousHeight = Math.max(previousHeight, currentHeight);
    const nearBottom = globalThis.scrollY + globalThis.innerHeight >= currentHeight - 12;
    if (stableRounds >= 2 && nearBottom) break;
  }
}

function normalizeDeepScanLevel(rawLevel: unknown): number {
  return Math.min(5, Math.max(1, Number(rawLevel) || 3));
}

async function prepareExhaustiveDomScan(rawLevel: unknown): Promise<void> {
  const level = normalizeDeepScanLevel(rawLevel);
  const originalY = globalThis.scrollY;

  await autoScrollForLazyLoad(3 + level);
  await clickExpandableControls(Math.min(6, 2 + Math.ceil(level / 2)));
  await autoScrollForLazyLoad(2 + level);
  await clickExpandableControls(Math.min(5, 1 + Math.floor(level / 2)));

  globalThis.scrollTo({ top: originalY, behavior: "auto" });
  await wait(80);
}

// ─── XPath ───────────────────────────────────────────────────────────────────

function getXPath(element: Element): string {
  if (element.id) return `//*[@id="${element.id}"]`;

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tagName = current.tagName.toLowerCase();
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName.toLowerCase() === tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${tagName}[${index}]`);
    current = current.parentElement;
  }

  return `/${parts.join("/")}`;
}

function resolveNodeByXPath(xpath: string): Element | null {
  if (!xpath || typeof xpath !== "string") return null;
  try {
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const node = result.singleNodeValue;
    return node instanceof Element ? node : null;
  } catch {
    return null;
  }
}

// ─── Segment extraction ───────────────────────────────────────────────────────

function splitLongText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split(/\n+/).map((p) => normalizeWhitespace(p)).filter(Boolean);

  let buffer = "";
  const pushBuffer = () => {
    if (!buffer) return;
    chunks.push(buffer);
    buffer = "";
  };

  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    const candidate = buffer ? `${buffer} ${paragraph}` : paragraph;
    if (candidate.length <= maxLength) {
      buffer = candidate;
      continue;
    }

    pushBuffer();
    if (paragraph.length <= maxLength) {
      buffer = paragraph;
      continue;
    }

    let start = 0;
    while (start < paragraph.length) {
      chunks.push(paragraph.slice(start, start + maxLength));
      start += maxLength;
    }
  }

  pushBuffer();
  return chunks.length ? chunks : [text.slice(0, maxLength)];
}

function mergeSegmentsByThreadContainer(
  segments: Array<{ text: string; xpath: string; node: Element }>,
): Array<{ text: string; xpath: string }> {
  // Group consecutive segments that share the same nearest thread container.
  // This prevents one social-feed post from appearing as multiple articles.
  const CONTAINER_SELECTOR = CONTENT_CONTAINER_SELECTOR;
  const result: Array<{ text: string; xpath: string }> = [];
  let i = 0;

  while (i < segments.length) {
    const current = segments[i];
    const container = current.node.closest(CONTAINER_SELECTOR);

    if (!container) {
      result.push({ text: current.text, xpath: current.xpath });
      i += 1;
      continue;
    }

    // Collect all consecutive segments that belong to the same container.
    const group: typeof segments = [current];
    let j = i + 1;
    while (j < segments.length) {
      const next = segments[j];
      if (next.node.closest(CONTAINER_SELECTOR) === container) {
        group.push(next);
        j += 1;
      } else {
        break;
      }
    }

    if (group.length === 1) {
      result.push({ text: current.text, xpath: current.xpath });
    } else {
      const mergedText = normalizeWhitespace(group.map((s) => s.text).join(" "));
      result.push({ text: mergedText, xpath: current.xpath });
    }

    i = j;
  }

  return result;
}

function mergeBrokenSegments(segments: Array<{ text: string; xpath: string }>): Array<{ text: string; xpath: string }> {
  if (segments.length <= 1) return segments;

  const merged: Array<{ text: string; xpath: string }> = [];
  let buffer = segments[0];

  for (let i = 1; i < segments.length; i += 1) {
    const current = segments[i];
    const looksBroken = /[,:;\-–]$/.test(buffer.text) || buffer.text.split(" ").length < 8;
    const sameLengthProfile = Math.abs(buffer.text.length - current.text.length) < 80;

    if (looksBroken && sameLengthProfile && buffer.text.length + current.text.length < MAX_TEXT_LENGTH) {
      buffer = { text: `${buffer.text} ${current.text}`, xpath: buffer.xpath };
    } else {
      merged.push(buffer);
      buffer = current;
    }
  }

  merged.push(buffer);
  return merged;
}

function extractRawSegments(options: { exhaustive?: boolean } = {}): RawSegment[] {
  const exhaustive = options.exhaustive !== false;
  const segments: Array<{ text: string; xpath: string; node: Element }> = [];
  const visited = new Set<Element>();
  const seenNodes = new Set<Element>();

  const threadNodes = exhaustive ? [...document.querySelectorAll(THREAD_SELECTOR)] : [];
  const blockNodes = [...document.querySelectorAll(BLOCK_SELECTOR)];
  const hasThreadNodes = exhaustive && threadNodes.length > 0;
  const nodes = hasThreadNodes ? threadNodes : blockNodes;

  for (const node of nodes) {
    const sourceNode = hasThreadNodes ? chooseFocusedThreadContentNode(node) : findBestContentRoot(node);
    if (seenNodes.has(sourceNode)) continue;
    seenNodes.add(sourceNode);
    if (visited.has(sourceNode) || !isVisible(sourceNode)) continue;
    const parent = sourceNode.parentElement;
    if (parent && visited.has(parent)) continue;

    const text = exhaustive
      ? extractTextForNode(sourceNode)
      : extractTextForNode(sourceNode);
    if (text.length < MIN_TEXT_LENGTH) continue;

    visited.add(sourceNode);
    const xpath = getXPath(sourceNode);
    // Cache full text BEFORE chunking so hydration can return the complete article.
    segmentFullTextCache.set(xpath, text);
    const chunks = splitLongText(text, MAX_TEXT_LENGTH);
    for (const chunk of chunks) {
      if (chunk.length >= MIN_TEXT_LENGTH) segments.push({ text: chunk, xpath, node: sourceNode });
    }
  }

  // Merge segments that belong to the same thread container before chunking dedup.
  let containerMerged = mergeSegmentsByThreadContainer(segments);

  // Fail-safe for platforms with unstable container semantics: if exhaustive scan
  // yields nothing, retry with a broader legacy-style block set.
  if (!containerMerged.length && exhaustive) {
    const retrySegments: Array<{ text: string; xpath: string; node: Element }> = [];
    const retryVisited = new Set<Element>();
    const retrySeen = new Set<Element>();
    const fallbackNodes = [...document.querySelectorAll(FALLBACK_BLOCK_SELECTOR)];

    for (const node of fallbackNodes) {
      const sourceNode = findBestContentRoot(node);
      if (retrySeen.has(sourceNode)) continue;
      retrySeen.add(sourceNode);
      if (retryVisited.has(sourceNode) || !isVisible(sourceNode)) continue;
      const parent = sourceNode.parentElement;
      if (parent && retryVisited.has(parent)) continue;

      const text = extractTextForNode(sourceNode);
      if (text.length < MIN_TEXT_LENGTH) continue;

      retryVisited.add(sourceNode);
      const xpath = getXPath(sourceNode);
      segmentFullTextCache.set(xpath, text);
      const chunks = splitLongText(text, MAX_TEXT_LENGTH);
      for (const chunk of chunks) {
        if (chunk.length >= MIN_TEXT_LENGTH) retrySegments.push({ text: chunk, xpath, node: sourceNode });
      }
    }

    containerMerged = mergeSegmentsByThreadContainer(retrySegments);
  }

  return mergeBrokenSegments(containerMerged).map((segment, index) => ({ ...segment, id: index }));
}

// ─── Segment actions ──────────────────────────────────────────────────────────

function highlightSegment(xpath: string): void {
  try {
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const node = result.singleNodeValue;
    if (node instanceof HTMLElement) {
      node.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "nearest" });
      node.style.outline = "2px solid #ff7a00";
      node.style.outlineOffset = "2px";
      setTimeout(() => {
        node.style.outline = "";
        node.style.outlineOffset = "";
      }, 1600);
    }
  } catch {
    // best effort
  }
}

function scoreTextMatch(referenceText: string, candidateText: string): number {
  const refNormalized = normalizeForMatch(referenceText);
  const candidateNormalized = normalizeForMatch(candidateText);
  if (!refNormalized || !candidateNormalized) {
    return 0;
  }

  if (candidateNormalized.includes(refNormalized)) {
    return 1;
  }

  const refTokens = [...new Set(textToTokens(referenceText))].slice(0, 40);
  if (!refTokens.length) {
    return 0;
  }

  const candidateTokens = new Set(textToTokens(candidateText));
  let matched = 0;
  for (const token of refTokens) {
    if (hasApproxTokenMatch(candidateTokens, token)) {
      matched += 1;
    }
  }

  return Number((matched / refTokens.length).toFixed(4));
}

function findBestNodeByTextHint(textHint: string): Element | null {
  const normalizedHint = normalizeWhitespace(textHint);
  if (normalizedHint.length < 24) {
    return null;
  }

  const threadCandidates = [...document.querySelectorAll(THREAD_SELECTOR)].filter((node) => isVisible(node));
  let bestNode: Element | null = null;
  let bestScore = 0;

  for (const candidate of threadCandidates.slice(0, 220)) {
    const text = extractTextForNode(candidate);
    const score = scoreTextMatch(normalizedHint, text);
    if (score > bestScore) {
      bestNode = candidate;
      bestScore = score;
    }
  }

  if (bestNode && bestScore >= 0.45) {
    return bestNode;
  }

  const rawSegments = extractRawSegments({ exhaustive: false });
  let bestRawXpath = "";

  for (const segment of rawSegments) {
    const score = scoreTextMatch(normalizedHint, segment.text);
    if (score > bestScore) {
      bestScore = score;
      bestRawXpath = segment.xpath;
    }
  }

  if (bestRawXpath && bestScore >= 0.45) {
    return resolveNodeByXPath(bestRawXpath);
  }

  return null;
}

function findBestHydrationNode(node: Element): Element {
  const candidates: Element[] = [];
  let current: Element | null = node;
  let depth = 0;

  while (current && depth < 8) {
    candidates.push(current);
    current = current.parentElement;
    depth += 1;
  }

  const threadContainer = node.closest("article, [role='article']");
  if (threadContainer && !candidates.includes(threadContainer)) {
    candidates.push(threadContainer);
  }

  let bestNode = node;
  let bestLength = extractTextForNode(node).length;

  for (const candidate of candidates) {
    if (!isVisible(candidate)) continue;
    const text = extractTextForNode(candidate);
    const length = text.length;
    if (length < MIN_TEXT_LENGTH) continue;
    if (length > 12000) continue;
    if (length > bestLength) {
      bestNode = candidate;
      bestLength = length;
    }
  }

  return bestNode;
}

async function expandControlsWithin(root: Element): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    const controls = root.querySelectorAll("button, a, summary, [role='button'], [aria-expanded='false']");
    let clicked = 0;

    for (const control of controls) {
      if (!isElementVisibleForInteraction(control)) continue;
      if (control instanceof HTMLButtonElement && control.disabled) continue;
      const label = normalizeWhitespace(
        control.getAttribute("aria-label")
        ?? control.getAttribute("title")
        ?? control.textContent
        ?? "",
      );
      if (!label || label.length > 40) continue;
      if (looksLikeNonContentAction(label)) continue;
      if (!looksLikeExpandControl(label)) continue;

      try {
        control.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: globalThis as unknown as Window }));
        clicked += 1;
      } catch {
        // best effort
      }
    }

    if (!clicked) {
      break;
    }
    await wait(140);
  }
}

async function getFullTextByXPath(xpath: string, textHint = ""): Promise<string> {
  // Find the correct node. Use textHint to recover when xpath drifts on dynamic feeds.
  let node = resolveNodeByXPath(xpath);
  if (node && textHint) {
    const currentText = extractTextForNode(node);
    if (scoreTextMatch(textHint, currentText) < 0.35) {
      node = findBestNodeByTextHint(textHint) ?? node;
    }
  }
  if (!node && textHint) {
    node = findBestNodeByTextHint(textHint);
  }

  if (!node) {
    // DOM node gone (navigation/re-render): fall back to scan-time cache.
    return segmentFullTextCache.get(xpath) ?? "";
  }

  const freshText = extractTextForNode(node);

  // Return the longer of: live DOM text vs scan-time cache (picks up any extra
  // content that may have been captured during the initial full-page expansion).
  const cached = segmentFullTextCache.get(xpath) ?? "";
  return freshText.length >= cached.length ? freshText : cached;
}
// ─── Scan-time full-text cache ──────────────────────────────────────────────
// Populated by extractRawSegments() at scan time so hydration never needs to
// walk up the ancestor tree (which picks up post-card chrome on social feeds).
const segmentFullTextCache = new Map<string, string>(); // xpath → full text
// ─── Capture state ────────────────────────────────────────────────────────────

const captureState: CaptureState = {
  active: false,
  tabId: null,
  storageKey: null,
  topics: [],
  threshold: 0.35,
  topicsExpanded: [],
  observer: null,
  debounceTimer: null,
  intervalTimer: null,
  onScroll: null,
  records: new Map(),
};

function recordKey(segment: { text: string; xpath: string }): string {
  const textKey = normalizeWhitespace(segment.text).toLowerCase().slice(0, 240);
  return `${segment.xpath}::${textKey}`;
}

function hydrateRecords(items: CaptureRecord[]): void {
  captureState.records = new Map();
  for (const item of items ?? []) {
    const key = recordKey(item);
    captureState.records.set(key, { ...item, key, capturedAt: item.capturedAt ?? item.firstSeenAt });
  }
}

async function persistCaptureNow(): Promise<void> {
  if (!captureState.active || !captureState.storageKey) return;

  const now = Date.now();
  const raw = extractRawSegments();

  for (const segment of raw) {
    const scoringTopics = captureState.topicsExpanded.length ? captureState.topicsExpanded : captureState.topics;
    const score = lexicalTopicScore(segment.text, scoringTopics);
    if (score < captureState.threshold) continue;

    const key = recordKey(segment);
    const existing = captureState.records.get(key);
    const matchedKeywords = getMatchedKeywords(segment.text, scoringTopics);

    if (existing) {
      existing.score = Math.max(existing.score ?? 0, Number(score.toFixed(4)));
      existing.lastSeenAt = now;
      existing.matchedKeywords = [...new Set([...(existing.matchedKeywords ?? []), ...matchedKeywords])].slice(0, 12);
    } else {
      captureState.records.set(key, {
        key,
        capturedAt: now,
        id: segment.id,
        text: segment.text,
        xpath: segment.xpath,
        score: Number(score.toFixed(4)),
        matchedKeywords,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }
  }

  const items = [...captureState.records.values()]
    .sort((a, b) => (b.score - a.score) || (b.lastSeenAt - a.lastSeenAt))
    .slice(0, MAX_CAPTURE_ITEMS);

  hydrateRecords(items);

  await chrome.storage.local.set({
    [captureState.storageKey]: {
      tabId: captureState.tabId,
      domain: location.hostname,
      topics: captureState.topics,
      threshold: captureState.threshold,
      updatedAt: now,
      count: items.length,
      items,
    },
  });
}

function scheduleCapturePersist(): void {
  if (!captureState.active) return;
  if (captureState.debounceTimer) clearTimeout(captureState.debounceTimer);
  captureState.debounceTimer = setTimeout(() => {
    persistCaptureNow().catch(() => undefined);
  }, 900);
}

async function startCapture(config: {
  tabId?: number;
  topics?: string | string[];
  threshold?: number;
}): Promise<void> {
  stopCapture();

  captureState.active = true;
  captureState.tabId = Number(config.tabId);
  captureState.storageKey = `captureResults_${captureState.tabId}`;
  captureState.topics = parseTopics(config.topics ?? []);
  captureState.topicsExpanded = expandTopicCandidates(captureState.topics);
  captureState.threshold = Number.isFinite(config.threshold) ? Number(config.threshold) : 0.35;

  try {
    const existing = await chrome.storage.local.get([captureState.storageKey]);
    const existingItems: CaptureRecord[] = (existing[captureState.storageKey] as { items?: CaptureRecord[] })?.items ?? [];
    hydrateRecords(existingItems);
  } catch {
    captureState.records = new Map();
  }

  captureState.observer = new MutationObserver(() => { scheduleCapturePersist(); });
  if (document.body) {
    captureState.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  captureState.onScroll = () => { scheduleCapturePersist(); };
  window.addEventListener("scroll", captureState.onScroll, { passive: true });
  captureState.intervalTimer = setInterval(() => { scheduleCapturePersist(); }, 5000);

  await persistCaptureNow();
}

function stopCapture(): void {
  captureState.active = false;
  captureState.observer?.disconnect();
  captureState.observer = null;

  if (captureState.debounceTimer) {
    clearTimeout(captureState.debounceTimer);
    captureState.debounceTimer = null;
  }
  if (captureState.intervalTimer) {
    clearInterval(captureState.intervalTimer);
    captureState.intervalTimer = null;
  }
  if (captureState.onScroll) {
    window.removeEventListener("scroll", captureState.onScroll);
    captureState.onScroll = null;
  }
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: { type?: string; exhaustive?: boolean; deepScanLevel?: unknown; xpath?: string; textHint?: string; tabId?: number; topics?: string | string[]; threshold?: number },
    _sender,
    sendResponse: (response: unknown) => void,
  ) => {
    if (message?.type === "EXTRACT_SEGMENTS") {
      const exhaustive = message.exhaustive !== false;
      const deepScanLevel = normalizeDeepScanLevel(message.deepScanLevel);

      (async () => {
        // Auto-scroll và auto-click đã bị tắt — dùng nút Refresh trong popup để chủ động scan
        const raw = extractRawSegments({ exhaustive });
        sendResponse({ ok: true, total: raw.length, segments: raw, exhaustive, deepScanLevel });
      })().catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    }

    if (message?.type === "HIGHLIGHT_SEGMENT" && typeof message.xpath === "string") {
      highlightSegment(message.xpath);
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === "GET_FULL_SEGMENT_TEXT" && typeof message.xpath === "string") {
      getFullTextByXPath(message.xpath, typeof message.textHint === "string" ? message.textHint : "")
        .then((text) => sendResponse({ ok: true, text }))
        .catch((error: unknown) => {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error), text: "" });
        });
      return true;
    }

    if (message?.type === "START_CAPTURE") {
      startCapture(message)
        .then(() => sendResponse({ ok: true, active: true }))
        .catch((error: unknown) => {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }

    if (message?.type === "STOP_CAPTURE") {
      stopCapture();
      sendResponse({ ok: true, active: false });
      return true;
    }

    if (message?.type === "GET_CAPTURE_STATE") {
      sendResponse({
        ok: true,
        active: captureState.active,
        tabId: captureState.tabId,
        topics: captureState.topics,
        threshold: captureState.threshold,
        count: captureState.records.size,
      });
      return true;
    }

    return false;
  },
);
