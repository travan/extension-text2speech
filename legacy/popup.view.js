(() => {
  function buildDetailMetaText(segment) {
    const percent = Math.round((segment.score || 0) * 100);
    const keywords = segment.matchedKeywords?.length
      ? ` | Từ khóa: ${segment.matchedKeywords.join(", ")}`
      : "";
    return `Độ liên quan: ${percent}%${keywords}`;
  }

  function getMissingMatchText(filterMode) {
    if (filterMode === "ai") {
      return "Không match trực tiếp, nhưng có thể match ngữ nghĩa";
    }
    return "Không match trực tiếp theo từ khóa";
  }

  function renderSegmentsView(args) {
    const {
      items,
      pagination,
      elements,
      helpers,
      handlers,
      state
    } = args;

    const {
      segmentsEl,
      popupPageInfo,
      popupPrevBtn,
      popupNextBtn,
      resultsMetaEl,
      segmentTemplate
    } = elements;

    segmentsEl.innerHTML = "";
    if (!items.length) {
      handlers.hideDetailPanel();
    }

    const totalPages = Math.max(1, Math.ceil(items.length / pagination.pageSize));
    const page = Math.min(Math.max(1, pagination.page), totalPages);
    popupPageInfo.textContent = `Trang ${page}/${totalPages}`;
    popupPrevBtn.disabled = page <= 1;
    popupNextBtn.disabled = page >= totalPages;

    if (!items.length) {
      const topics = helpers.parseTopics(helpers.getTopicsText());
      resultsMetaEl.textContent = topics.length
        ? `Chưa có kết quả cho topic: ${topics.join(", ")} (ngưỡng ${helpers.getThresholdText()}). Hãy giảm ngưỡng hoặc dùng từ khóa ngắn hơn.`
        : "Chưa có kết quả. Hãy nhập topic rồi bấm Quét & Lọc.";
      return { page, totalPages };
    }

    const from = (page - 1) * pagination.pageSize;
    const to = from + pagination.pageSize;
    const pageItems = items.slice(from, to);
    resultsMetaEl.textContent = `Hiển thị ${from + 1}-${Math.min(to, items.length)} / ${items.length} kết quả`;

    for (const segment of pageItems) {
      const fragment = segmentTemplate.content.cloneNode(true);
      const itemEl = fragment.querySelector(".segment-item");
      const scoreEl = fragment.querySelector(".segment-score");
      const tagsEl = fragment.querySelector(".segment-tags");
      const textEl = fragment.querySelector(".segment-text");
      const voiceSelect = fragment.querySelector(".voice-select");
      const pickCheckbox = fragment.querySelector(".pick-checkbox");
      const readOneBtn = fragment.querySelector(".read-one-btn");
      const pauseToggleBtn = fragment.querySelector(".pause-toggle-btn");
      const scanReadBtn = fragment.querySelector(".scan-read-btn");
      const focusBtn = fragment.querySelector(".focus-btn");
      itemEl.dataset.segmentKey = helpers.getSegmentKey(segment);

      const semanticText = segment.semanticScore == null ? "n/a" : segment.semanticScore;
      if (helpers.getFilterMode() === "ai") {
        scoreEl.textContent = `AI score ${segment.score.toFixed(3)} | Key ${segment.lexicalScore.toFixed(3)} | Sem ${semanticText}`;
      } else {
        scoreEl.textContent = `Độ liên quan: ${Math.round(segment.score * 100)}%`;
      }

      tagsEl.textContent = segment.matchedKeywords?.length
        ? `Từ khóa trúng: ${segment.matchedKeywords.join(", ")}`
        : getMissingMatchText(helpers.getFilterMode());
      textEl.textContent = segment.text;

      helpers.buildVoiceOptions(voiceSelect, segment.voice || helpers.getDefaultVoice());

      voiceSelect.addEventListener("change", () => {
        segment.voice = voiceSelect.value;
      });

      pickCheckbox.checked = segment.selected !== false;
      pickCheckbox.addEventListener("change", () => {
        segment.selected = pickCheckbox.checked;
      });

      focusBtn.addEventListener("click", async () => {
        await handlers.hydrateFullTextForSegment(segment);
        handlers.showDetailPanel(segment);
        await handlers.focusSegmentInThread(segment);
        textEl.textContent = segment.text;
      });

      readOneBtn.addEventListener("click", () => {
        handlers.playSingleSegment(segment);
      });

      pauseToggleBtn.textContent = state.paused ? "Tiếp tục" : "Tạm dừng";
      pauseToggleBtn.disabled = !state.speaking;
      pauseToggleBtn.addEventListener("click", () => {
        handlers.togglePauseResume();
      });

      scanReadBtn.addEventListener("click", async () => {
        await handlers.rescanAndReadFromSegment(segment);
        textEl.textContent = segment.text;
      });

      itemEl.addEventListener("click", async (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("button,select,input,label")) return;
        itemEl.classList.toggle("expanded");
        await handlers.hydrateFullTextForSegment(segment);
        await handlers.focusSegmentInThread(segment);
        handlers.showDetailPanel(segment);
        textEl.textContent = segment.text;
      });

      segmentsEl.append(fragment);
    }

    handlers.syncPauseButtons();
    handlers.syncReadingIndicators();
    return { page, totalPages };
  }

  globalThis.PopupView = {
    buildDetailMetaText,
    renderSegmentsView
  };
})();
