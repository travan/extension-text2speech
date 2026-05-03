import { useEffect, useMemo, useRef, useState } from "react";

import { buildVoiceOptions, getVoiceByName } from "../../../services/speech";
import type { ScoredSegment } from "../../../services/scan";

interface UseSpeechOptions {
  segments: ScoredSegment[];
  defaultVoice: string;
  onStatus: (message: string) => void;
}

export interface UseSpeechReturn {
  voices: SpeechSynthesisVoice[];
  voiceOptions: Array<{ value: string; label: string }>;
  speaking: boolean;
  paused: boolean;
  currentReadingSegmentId: number | null;
  playAll: () => void;
  playSingle: (segment: ScoredSegment) => void;
  stop: () => void;
  togglePause: () => void;
}

export function useSpeech({ segments, defaultVoice, onStatus }: UseSpeechOptions): UseSpeechReturn {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentReadingSegmentId, setCurrentReadingSegmentId] = useState<number | null>(null);
  const queueRef = useRef<Array<{ utterance: SpeechSynthesisUtterance; segmentId: number }>>([]);

  const voiceOptions = useMemo(() => buildVoiceOptions(voices), [voices]);

  useEffect(() => {
    function loadVoices(): void {
      setVoices(globalThis.speechSynthesis.getVoices());
    }

    loadVoices();
    globalThis.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      globalThis.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  function playQueue(): void {
    const next = queueRef.current.shift();
    if (!next) {
      setSpeaking(false);
      setPaused(false);
      setCurrentReadingSegmentId(null);
      onStatus("Read completed.");
      return;
    }

    setSpeaking(true);
    setPaused(false);
    setCurrentReadingSegmentId(next.segmentId);
    next.utterance.onend = () => playQueue();
    next.utterance.onerror = () => playQueue();
    globalThis.speechSynthesis.speak(next.utterance);
  }

  function buildUtterance(segment: ScoredSegment): SpeechSynthesisUtterance {
    const utterance = new SpeechSynthesisUtterance(segment.text);
    const voice = getVoiceByName(voices, segment.voice || defaultVoice);
    if (voice) {
      utterance.voice = voice;
    }
    utterance.lang = "vi-VN";
    return utterance;
  }

  function playAll(): void {
    if (segments.length === 0) {
      onStatus("No segments available to play.");
      return;
    }
    queueRef.current = segments
      .filter((segment) => segment.selected)
      .map((segment) => ({ utterance: buildUtterance(segment), segmentId: segment.id }));
    if (!queueRef.current.length) {
      onStatus("Select at least one segment to read.");
      return;
    }
    globalThis.speechSynthesis.cancel();
    onStatus(`Speaking ${queueRef.current.length} segment(s).`);
    playQueue();
  }

  function playSingle(segment: ScoredSegment): void {
    queueRef.current = [{ utterance: buildUtterance(segment), segmentId: segment.id }];
    globalThis.speechSynthesis.cancel();
    onStatus("Speaking selected segment.");
    playQueue();
  }

  function stop(): void {
    globalThis.speechSynthesis.cancel();
    queueRef.current = [];
    setSpeaking(false);
    setPaused(false);
    setCurrentReadingSegmentId(null);
    onStatus("Stopped speaking.");
  }

  function togglePause(): void {
    if (!speaking) {
      return;
    }
    if (paused) {
      globalThis.speechSynthesis.resume();
      setPaused(false);
      onStatus("Resumed.");
    } else {
      globalThis.speechSynthesis.pause();
      setPaused(true);
      onStatus("Paused.");
    }
  }

  return { voices, voiceOptions, speaking, paused, currentReadingSegmentId, playAll, playSingle, stop, togglePause };
}
