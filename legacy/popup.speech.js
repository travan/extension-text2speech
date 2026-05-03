(() => {
  function getFreeVietnameseVoice(voices) {
    if (!voices?.length) return null;
    const viVoices = voices.filter((voice) => String(voice.lang || "").toLowerCase().startsWith("vi"));
    if (!viVoices.length) return null;

    const preferred = viVoices.find((voice) => {
      const name = String(voice.name || "").toLowerCase();
      return name.includes("google") || name.includes("microsoft") || name.includes("natural");
    });
    return preferred || viVoices[0];
  }

  function getVoiceByName(voices, name, freeVoiceValue) {
    if (name === freeVoiceValue) {
      return getFreeVietnameseVoice(voices);
    }
    return voices.find((voice) => voice.name === name) || null;
  }

  function buildVoiceOptions(selectEl, voices, selectedValue, freeVoiceValue) {
    selectEl.innerHTML = "";
    const autoOption = document.createElement("option");
    autoOption.value = "";
    autoOption.textContent = "Tự động";
    selectEl.append(autoOption);

    const viOption = document.createElement("option");
    viOption.value = freeVoiceValue;
    viOption.textContent = "Tiếng Việt miễn phí (tự động)";
    selectEl.append(viOption);

    for (const voice of voices) {
      const option = document.createElement("option");
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      selectEl.append(option);
    }

    if (selectedValue && [...selectEl.options].some((opt) => opt.value === selectedValue)) {
      selectEl.value = selectedValue;
    }
  }

  globalThis.PopupSpeech = {
    getFreeVietnameseVoice,
    getVoiceByName,
    buildVoiceOptions
  };
})();
