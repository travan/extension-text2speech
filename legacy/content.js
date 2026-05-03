(() => {
  const MIN_TEXT_LENGTH = 30;
  const MAX_TEXT_LENGTH = 1600;
  const THREAD_SELECTOR = [
    "article",
    "[role='article']",
    "section",
    "li"
  ].join(",");
  const BLOCK_SELECTOR = [
    "article",
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
    "span"
  ].join(",");

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
  const MAX_CAPTURE_ITEMS = 5000;
  const EXPANDABLE_TEXT_MATCHERS = [
    "xem them",
    "xem thêm",
    "mo rong",
    "mở rộng",
    "hien thi them",
    "hiển thị thêm",
    "doc them",
    "đọc thêm",
    "read more",
    "see more",
    "show more"
  ];
  const NON_CONTENT_ACTION_MATCHERS = [
    "comment",
    "binh luan",
    "bình luận",
    "reply",
    "tra loi",
    "trả lời",
    "menu",
    "share",
    "chia sẻ",
    "follow",
    "theo dõi",
    "like",
    "repost"
  ];

  const captureState = {
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
    records: new Map()
  };

  function normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ").trim();
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

  function toFoldedText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function looksLikeExpandControl(text) {
    const folded = toFoldedText(normalizeWhitespace(text));
    if (!folded) return false;
    return EXPANDABLE_TEXT_MATCHERS.some((keyword) => folded.includes(keyword));
  }

  function looksLikeNonContentAction(text) {
    const folded = toFoldedText(normalizeWhitespace(text));
    if (!folded) return false;
    return NON_CONTENT_ACTION_MATCHERS.some((keyword) => folded.includes(keyword));
  }

  function isElementVisibleForInteraction(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function expandHiddenTextInTree(root) {
    if (!(root instanceof Element)) return;

    const allNodes = [root, ...root.querySelectorAll("*")];
    for (const node of allNodes) {
      if (!(node instanceof HTMLElement)) continue;

      const computed = getComputedStyle(node);
      const style = node.style;

      if (computed.maxHeight && computed.maxHeight !== "none") style.maxHeight = "none";
      if (computed.overflow === "hidden") style.overflow = "visible";
      if (computed.overflowY === "hidden") style.overflowY = "visible";
      if (computed.webkitLineClamp && computed.webkitLineClamp !== "none") style.webkitLineClamp = "unset";
      if (computed.lineClamp && computed.lineClamp !== "none") style.lineClamp = "unset";
      if (computed.textOverflow === "ellipsis") style.textOverflow = "clip";
    }
  }

  function findThreadContainer(element) {
    if (!(element instanceof Element)) return null;
    return element.closest("article, [role='article'], section, li");
  }

  function findExpandableControls() {
    const selectors = [
      "button",
      "a",
      "summary",
      "[role='button']",
      "[aria-expanded='false']",
      "[data-testid*='see_more']",
      "[data-testid*='show_more']"
    ].join(",");

    const candidates = document.querySelectorAll(selectors);
    const controls = [];

    for (const element of candidates) {
      if (!isElementVisibleForInteraction(element)) continue;
      if (element instanceof HTMLButtonElement && element.disabled) continue;
      const container = findThreadContainer(element);
      if (!container) continue;
      const containerTextLength = normalizeWhitespace(container.textContent || "").length;
      if (containerTextLength < MIN_TEXT_LENGTH) continue;

      const label = normalizeWhitespace(
        element.getAttribute("aria-label")
          || element.getAttribute("title")
          || element.textContent
          || ""
      );
      if (!label || label.length > 40) continue;
      if (looksLikeNonContentAction(label)) continue;

      const expandableByText = looksLikeExpandControl(label);
      if (!expandableByText) continue;
      controls.push(element);
    }

    return controls;
  }

  async function clickExpandableControls(maxRounds = 3) {
    for (let round = 0; round < maxRounds; round += 1) {
      const controls = findExpandableControls();
      if (!controls.length) break;

      let clicked = 0;
      for (const element of controls.slice(0, 80)) {
        try {
          element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: globalThis }));
          clicked += 1;
        } catch (_error) {
          // Continue best effort.
        }
      }

      if (!clicked) break;
      await new Promise((resolve) => setTimeout(resolve, 160));
      await new Promise((resolve) => setTimeout(resolve, 160));
    }
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function autoScrollForLazyLoad(maxSteps = 7) {
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
      if (stableRounds >= 2 && nearBottom) {
        break;
      }
    }
  }

  function normalizeDeepScanLevel(rawLevel) {
    return Math.min(5, Math.max(1, Number(rawLevel) || 3));
  }

  async function prepareExhaustiveDomScan(rawLevel) {
    const level = normalizeDeepScanLevel(rawLevel);
    const originalY = globalThis.scrollY;
    const firstScrollSteps = 3 + level;
    const secondScrollSteps = 2 + level;
    const firstExpandRounds = Math.min(6, 2 + Math.ceil(level / 2));
    const secondExpandRounds = Math.min(5, 1 + Math.floor(level / 2));

    await autoScrollForLazyLoad(firstScrollSteps);
    await clickExpandableControls(firstExpandRounds);
    await autoScrollForLazyLoad(secondScrollSteps);
    await clickExpandableControls(secondExpandRounds);

    globalThis.scrollTo({ top: originalY, behavior: "auto" });
    await wait(80);
  }

  function extractTextForNode(node) {
    if (!(node instanceof Element)) return "";

    const clone = node.cloneNode(true);
    if (!(clone instanceof Element)) return normalizeWhitespace(node.textContent || "");
    expandHiddenTextInTree(clone);
    return normalizeWhitespace(clone.textContent || "");
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
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

  function parseTopics(input) {
    if (Array.isArray(input)) {
      return [...new Set(input.map((x) => String(x || "").trim()).filter(Boolean))];
    }

    return [...new Set(String(input || "")
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean))];
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
      if (normalizedText.includes(normalizedTopic)) hits.push(topic);

      const topicTokens = textToTokens(topic);
      for (const token of topicTokens) {
        if (hasApproxTokenMatch(textTokens, token)) hits.push(token);
      }
    }

    return [...new Set(hits)].slice(0, 10);
  }

  function extractRawSegments(options = {}) {
    const exhaustive = options.exhaustive !== false;
    const segments = [];
    const visited = new Set();
    const seenNodes = new Set();
    const threadNodes = exhaustive ? [...document.querySelectorAll(THREAD_SELECTOR)] : [];
    const blockNodes = [...document.querySelectorAll(BLOCK_SELECTOR)];
    const nodes = exhaustive
      ? [...threadNodes, ...blockNodes]
      : blockNodes;

    for (const node of nodes) {
      if (seenNodes.has(node)) continue;
      seenNodes.add(node);
      if (visited.has(node) || !isVisible(node)) continue;
      const parent = node.parentElement;
      if (parent && visited.has(parent)) continue;

      const text = exhaustive
        ? extractTextForNode(node)
        : normalizeWhitespace(node.innerText || "");
      if (text.length < MIN_TEXT_LENGTH) continue;

      visited.add(node);
      const xpath = getXPath(node);
      const chunks = splitLongText(text, MAX_TEXT_LENGTH);
      for (const chunk of chunks) {
        if (chunk.length < MIN_TEXT_LENGTH) continue;
        segments.push({ text: chunk, xpath });
      }
    }

    return mergeBrokenSegments(segments).map((segment, index) => ({
      ...segment,
      id: index
    }));
  }

  function mergeBrokenSegments(segments) {
    if (segments.length <= 1) return segments;

    const merged = [];
    let buffer = segments[0];

    for (let i = 1; i < segments.length; i += 1) {
      const current = segments[i];
      const looksBroken = /[,:;\-–]$/.test(buffer.text) || buffer.text.split(" ").length < 8;
      const sameLengthProfile = Math.abs(buffer.text.length - current.text.length) < 80;

      if (looksBroken && sameLengthProfile && buffer.text.length + current.text.length < MAX_TEXT_LENGTH) {
        buffer = {
          text: `${buffer.text} ${current.text}`,
          xpath: buffer.xpath
        };
      } else {
        merged.push(buffer);
        buffer = current;
      }
    }

    merged.push(buffer);
    return merged;
  }

  function splitLongText(text, maxLength) {
    if (text.length <= maxLength) return [text];

    const chunks = [];
    const paragraphs = text
      .split(/\n+/)
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean);

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

      // Hard split very long paragraph when no natural boundary fits.
      let start = 0;
      while (start < paragraph.length) {
        chunks.push(paragraph.slice(start, start + maxLength));
        start += maxLength;
      }
    }

    pushBuffer();
    return chunks.length ? chunks : [text.slice(0, maxLength)];
  }

  function getXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const parts = [];
    let current = element;

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

  function highlightSegment(xpath) {
    try {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const node = result.singleNodeValue;
      if (node && node.style) {
        if (typeof node.scrollIntoView === "function") {
          node.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        }
        node.style.outline = "2px solid #ff7a00";
        node.style.outlineOffset = "2px";
        setTimeout(() => {
          node.style.outline = "";
          node.style.outlineOffset = "";
        }, 1600);
      }
    } catch (_error) {
      // Best effort.
    }
  }

  function resolveNodeByXPath(xpath) {
    if (!xpath || typeof xpath !== "string") return null;
    try {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue || null;
    } catch (_error) {
      return null;
    }
  }

  function findBestContentContainer(node) {
    if (!(node instanceof Element)) return null;
    const container = node.closest("article, [role='article'], section, li");
    if (container instanceof Element) return container;
    return node;
  }

  function getFullTextByXPath(xpath) {
    const node = resolveNodeByXPath(xpath);
    if (!(node instanceof Element)) return "";
    const contentNode = findBestContentContainer(node);
    return extractTextForNode(contentNode);
  }

  function recordKey(segment) {
    const textKey = normalizeWhitespace(segment.text).toLowerCase().slice(0, 240);
    return `${segment.xpath}::${textKey}`;
  }

  function hydrateRecords(items) {
    captureState.records = new Map();
    for (const item of items || []) {
      captureState.records.set(recordKey(item), item);
    }
  }

  async function persistCaptureNow() {
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
        existing.score = Math.max(existing.score || 0, Number(score.toFixed(4)));
        existing.lastSeenAt = now;
        existing.matchedKeywords = [...new Set([...(existing.matchedKeywords || []), ...matchedKeywords])].slice(0, 12);
      } else {
        captureState.records.set(key, {
          id: segment.id,
          text: segment.text,
          xpath: segment.xpath,
          score: Number(score.toFixed(4)),
          matchedKeywords,
          firstSeenAt: now,
          lastSeenAt: now
        });
      }
    }

    const items = [...captureState.records.values()]
      .sort((a, b) => (b.score - a.score) || (b.lastSeenAt - a.lastSeenAt))
      .slice(0, MAX_CAPTURE_ITEMS);

    await chrome.storage.local.set({
      [captureState.storageKey]: {
        tabId: captureState.tabId,
        domain: location.hostname,
        topics: captureState.topics,
        threshold: captureState.threshold,
        updatedAt: now,
        count: items.length,
        items
      }
    });
  }

  function scheduleCapturePersist() {
    if (!captureState.active) return;
    if (captureState.debounceTimer) {
      clearTimeout(captureState.debounceTimer);
    }

    captureState.debounceTimer = setTimeout(() => {
      persistCaptureNow().catch(() => {
        // Keep capture alive even if a persist attempt fails.
      });
    }, 900);
  }

  async function startCapture(config) {
    stopCapture();

    captureState.active = true;
    captureState.tabId = Number(config.tabId);
    captureState.storageKey = `captureResults_${captureState.tabId}`;
    captureState.topics = parseTopics(config.topics);
    captureState.topicsExpanded = expandTopicCandidates(captureState.topics);
    captureState.threshold = Number.isFinite(config.threshold) ? Number(config.threshold) : 0.35;

    try {
      const existing = await chrome.storage.local.get([captureState.storageKey]);
      const existingItems = existing[captureState.storageKey]?.items || [];
      hydrateRecords(existingItems);
    } catch (_error) {
      captureState.records = new Map();
    }

    captureState.observer = new MutationObserver(() => {
      scheduleCapturePersist();
    });

    if (document.body) {
      captureState.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    captureState.onScroll = () => {
      scheduleCapturePersist();
    };

    window.addEventListener("scroll", captureState.onScroll, { passive: true });
    captureState.intervalTimer = setInterval(() => {
      scheduleCapturePersist();
    }, 5000);

    await persistCaptureNow();
  }

  function stopCapture() {
    captureState.active = false;

    if (captureState.observer) {
      captureState.observer.disconnect();
      captureState.observer = null;
    }

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

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "EXTRACT_SEGMENTS") {
      const exhaustive = message?.exhaustive !== false;
      const deepScanLevel = normalizeDeepScanLevel(message?.deepScanLevel);
      (async () => {
        if (exhaustive) {
          await prepareExhaustiveDomScan(deepScanLevel);
        }
        const raw = extractRawSegments({ exhaustive });
        sendResponse({
          ok: true,
          total: raw.length,
          segments: raw,
          exhaustive,
          deepScanLevel
        });
      })().catch((error) => {
        sendResponse({ ok: false, error: error?.message || String(error) });
      });
      return true;
    }

    if (message?.type === "HIGHLIGHT_SEGMENT" && typeof message.xpath === "string") {
      highlightSegment(message.xpath);
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === "GET_FULL_SEGMENT_TEXT" && typeof message.xpath === "string") {
      const text = getFullTextByXPath(message.xpath);
      sendResponse({ ok: true, text });
      return true;
    }

    if (message?.type === "START_CAPTURE") {
      startCapture(message || {})
        .then(() => {
          sendResponse({ ok: true, active: true });
        })
        .catch((error) => {
          sendResponse({ ok: false, error: error?.message || String(error) });
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
        count: captureState.records.size
      });
      return true;
    }

    return false;
  });
})();
