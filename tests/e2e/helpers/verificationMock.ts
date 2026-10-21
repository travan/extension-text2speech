import type { Page } from "@playwright/test";

export async function installVerificationMock(page: Page, options: { settings?: Record<string, unknown>; storageDelayMs?: number } = {}) {
  await page.addInitScript((options) => {
    const state = {
      local: { globalSettings: {
        topics: "AI", threshold: 0.45, filterMode: "basic", embeddingModel: "text-embedding-3-small",
        localAiUrl: "http://127.0.0.1:11434", localAiModel: "qwen3.5:9b", defaultVoice: "",
        autoScanEnabled: false, autoScanIntervalSec: 2, deepScanEnabled: true, deepScanLevel: 3,
        ...options.settings,
      } } as Record<string, any>,
      session: {} as Record<string, any>, writes: [] as Record<string, any>[], messages: [] as any[],
      utterances: [] as SpeechSynthesisUtterance[], extractError: false, storageLoaded: false,
      segments: [
        { id: 1, text: "AI researchers trained a language model to assist programmers.", xpath: "/p[1]" },
        { id: 2, text: "AI systems can classify medical images for research.", xpath: "/p[2]" },
      ],
    };
    const area = (data: Record<string, any>, delayed: boolean) => ({
      get: async (keys?: string | string[] | null) => {
        const result = structuredClone(!keys ? data : Object.fromEntries(
          (typeof keys === "string" ? [keys] : keys).map((key) => [key, data[key]])));
        if (delayed && !state.storageLoaded && options.storageDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.storageDelayMs));
        }
        state.storageLoaded = true;
        return result;
      },
      set: async (payload: Record<string, any>) => {
        state.writes.push(structuredClone(payload)); Object.assign(data, structuredClone(payload));
      },
      remove: async (keys: string | string[]) => {
        for (const key of typeof keys === "string" ? [keys] : keys) delete data[key];
      },
    });
    const chromeMock = {
      runtime: { getURL: (path: string) => "http://127.0.0.1:4173/" + path },
      tabs: {
        query: async () => [{ id: 99, url: "https://example.com/feed" }],
        get: async () => ({ id: 99, url: "https://example.com/feed" }),
        sendMessage: async (_id: number, message: any) => {
          state.messages.push(message);
          if (message.type === "EXTRACT_SEGMENTS") return state.extractError
            ? { ok: false, error: "Extraction fixture error" } : { ok: true, segments: structuredClone(state.segments) };
          if (message.type === "GET_FULL_SEGMENT_TEXT") return { ok: true, text: state.segments.find((s) => s.xpath === message.xpath)?.text };
          return { ok: true };
        },
        update: async () => ({}), create: async () => ({}),
      },
      storage: { local: area(state.local, true), session: area(state.session, false) },
    };
    Object.defineProperty(globalThis, "chrome", { value: chromeMock, configurable: true });
    Object.defineProperty(globalThis, "__verificationMock", { value: state, configurable: true });
    // Both sides of the speech API must be mocked: native utterances reject
    // plain-object voices, which are intentionally used by this UI fixture.
    class MockUtterance {
      text: string;
      lang = "";
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { value: MockUtterance, configurable: true });
    Object.defineProperty(globalThis, "speechSynthesis", { configurable: true, value: {
      getVoices: () => [
        { name: "Test English", lang: "en-US", localService: true },
        { name: "Test Vietnamese", lang: "vi-VN", localService: true },
      ],
      onvoiceschanged: null,
      speak: (utterance: SpeechSynthesisUtterance) => state.utterances.push(utterance),
      cancel: () => {}, pause: () => {}, resume: () => {},
    } });
  }, options);
}
export const popupUrl = "http://127.0.0.1:4173/src/entrypoints/popup/index.html";
