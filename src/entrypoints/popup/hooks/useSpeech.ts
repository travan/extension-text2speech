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
  readingRange: { start: number; end: number } | null;
  canNext: boolean;
  next: () => void;
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
  const generationRef = useRef(0);
  const pausedRef = useRef(false);
  const endedWhilePausedRef = useRef(false);
  const [readingRange, setReadingRange] = useState<{ start: number; end: number } | null>(null);
  const [canNext, setCanNext] = useState(false);

  const voiceOptions = useMemo(() => buildVoiceOptions(voices), [voices]);

  useEffect(() => {
    function loadVoices(): void {
      setVoices(globalThis.speechSynthesis.getVoices());
    }

    loadVoices();
    globalThis.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      globalThis.speechSynthesis.onvoiceschanged = null;
      generationRef.current += 1;
      queueRef.current = [];
      globalThis.speechSynthesis.cancel();
    };
  }, []);

  function playQueue(generation = generationRef.current): void {
    if (generation !== generationRef.current) return;
    const next = queueRef.current.shift();
    if (!next) {
      setSpeaking(false);
      setPaused(false);
      setCurrentReadingSegmentId(null);
      setReadingRange(null);
      setCanNext(false);
      onStatus("Read completed.");
      return;
    }

    setSpeaking(true);
    setPaused(false);
    setCurrentReadingSegmentId(next.segmentId);
    setReadingRange(null);
    setCanNext(queueRef.current.length > 0);
    pausedRef.current = false;
    endedWhilePausedRef.current = false;
    next.utterance.onboundary = (event) => {
      if (generation !== generationRef.current || pausedRef.current) return;
      const start = event.charIndex;
      const text = next.utterance.text;
      if (start < 0 || start >= text.length) return;
      const length = event.charLength > 0 ? event.charLength : (text.slice(start).match(/^\S+/)?.[0].length || 1);
      setReadingRange({ start, end: Math.min(text.length, start + length) });
    };
    next.utterance.onend = () => {
      if (generation !== generationRef.current) return;
      if (pausedRef.current) { endedWhilePausedRef.current = true; return; }
      playQueue(generation);
    };
    next.utterance.onerror = () => {
      if (generation !== generationRef.current) return;
      generationRef.current += 1;
      queueRef.current = [];
      setSpeaking(false);
      setPaused(false);
      setCurrentReadingSegmentId(null);
      setReadingRange(null);
      setCanNext(false);
      pausedRef.current = false;
      onStatus("Speech failed. Try another voice.");
    };
    globalThis.speechSynthesis.speak(next.utterance);
  }

  function buildUtterance(segment: ScoredSegment): SpeechSynthesisUtterance {
    const utterance = new SpeechSynthesisUtterance(segment.text);
    const voice = getVoiceByName(voices, segment.voice || defaultVoice);
    if (voice) {
      utterance.voice = voice;
    }
    utterance.lang = voice?.lang || "vi-VN";
    return utterance;
  }

  function playAll(): void {
    if (speaking) {
      if (pausedRef.current) togglePause();
      return;
    }
    if (segments.length === 0) {
      onStatus("No segments available to play.");
      return;
    }
    const queue = segments
      .filter((segment) => segment.selected)
      .map((segment) => ({ utterance: buildUtterance(segment), segmentId: segment.id }));
    if (!queue.length) {
      onStatus("Select at least one segment to read.");
      return;
    }
    generationRef.current += 1;
    globalThis.speechSynthesis.cancel();
    globalThis.speechSynthesis.resume();
    queueRef.current = queue;
    onStatus(`Speaking ${queueRef.current.length} segment(s).`);
    playQueue();
  }

  function playSingle(segment: ScoredSegment): void {
    if (speaking && currentReadingSegmentId === segment.id) {
      if (pausedRef.current) togglePause();
      return;
    }
    generationRef.current += 1;
    globalThis.speechSynthesis.cancel();
    globalThis.speechSynthesis.resume();
    const index = segments.findIndex((item) => item.id === segment.id);
    const following = index < 0 ? [] : segments.slice(index + 1).filter((item) => item.selected);
    queueRef.current = [segment, ...following].map((item) => ({
      utterance: buildUtterance(item), segmentId: item.id,
    }));
    onStatus("Speaking from selected segment.");
    playQueue();
  }

  function next(): void {
    if (!speaking || !queueRef.current.length) return;
    generationRef.current += 1;
    globalThis.speechSynthesis.cancel();
    globalThis.speechSynthesis.resume();
    onStatus("Speaking next segment.");
    playQueue();
  }

  function stop(): void {
    generationRef.current += 1;
    queueRef.current = [];
    globalThis.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
    setCurrentReadingSegmentId(null);
    setReadingRange(null);
    setCanNext(false);
    pausedRef.current = false;
    endedWhilePausedRef.current = false;
    onStatus("Stopped speaking.");
  }

  function togglePause(): void {
    if (!speaking) {
      return;
    }
    if (pausedRef.current) {
      pausedRef.current = false;
      globalThis.speechSynthesis.resume();
      if (endedWhilePausedRef.current) {
        endedWhilePausedRef.current = false;
        playQueue();
        return;
      }
      setPaused(false);
      onStatus("Resumed.");
    } else {
      pausedRef.current = true;
      globalThis.speechSynthesis.pause();
      setPaused(true);
      onStatus("Paused.");
    }
  }

  return { voices, voiceOptions, speaking, paused, currentReadingSegmentId, readingRange, canNext, next, playAll, playSingle, stop, togglePause };
}
