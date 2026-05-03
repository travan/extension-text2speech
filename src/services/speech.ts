export const FREE_VI_VOICE_VALUE = "__vi_free_auto__";

export function getFreeVietnameseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) {
    return null;
  }
  const viVoices = voices.filter((voice) => String(voice.lang || "").toLowerCase().startsWith("vi"));
  if (!viVoices.length) {
    return null;
  }

  const preferred = viVoices.find((voice) => {
    const name = String(voice.name || "").toLowerCase();
    return name.includes("google") || name.includes("microsoft") || name.includes("natural");
  });
  return preferred || viVoices[0];
}

export function getVoiceByName(
  voices: SpeechSynthesisVoice[],
  name: string,
  freeVoiceValue = FREE_VI_VOICE_VALUE,
): SpeechSynthesisVoice | null {
  if (name === freeVoiceValue) {
    return getFreeVietnameseVoice(voices);
  }
  return voices.find((voice) => voice.name === name) || null;
}

export function buildVoiceOptions(voices: SpeechSynthesisVoice[]): Array<{ value: string; label: string }> {
  return [
    { value: "", label: "Tự động" },
    { value: FREE_VI_VOICE_VALUE, label: "Tiếng Việt miễn phí (tự động)" },
    ...voices.map((voice) => ({ value: voice.name, label: `${voice.name} (${voice.lang})` })),
  ];
}
