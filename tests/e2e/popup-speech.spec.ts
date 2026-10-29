import { test, expect } from "@playwright/test";

function installChromeMock(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    const messageLog: Array<{ type: string; xpath?: string }> = [];
    const store: Record<string, unknown> = {
      globalSettings: {
        topics: "ai",
        threshold: 0.3,
        filterMode: "basic",
        embeddingModel: "text-embedding-3-small",
        defaultVoice: "",
        autoScanEnabled: false,
        autoScanIntervalSec: 4,
        deepScanEnabled: true,
        deepScanLevel: 3,
      },
      openaiApiKey: "",
    };

    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { getURL: (path: string) => `http://127.0.0.1:4173/${path}` },
      tabs: {
        query: async () => [{ id: 99, url: "https://example.com/feed" }],
        sendMessage: async (_tabId: number, message: { type: string; xpath?: string }) => {
          messageLog.push(message);
          if (message.type === "EXTRACT_SEGMENTS") {
            return {
              ok: true,
              segments: [
                { id: 1, text: "AI is transforming the world", xpath: "/div[1]" },
                { id: 2, text: "Another AI story for testing", xpath: "/div[2]" },
              ],
            };
          }
          return { ok: true };
        },
        create: async () => ({}),
        update: async () => ({}),
      },
      storage: {
        local: {
          get: async (keys?: string | string[] | null) => {
            if (!keys) return store;
            if (typeof keys === "string") return { [keys]: store[keys] };
            const out: Record<string, unknown> = {};
            for (const key of keys) out[key] = store[key];
            return out;
          },
          set: async (payload: Record<string, unknown>) => {
            Object.assign(store, payload);
          },
          remove: async () => {},
        },
      },
    };

    // Stub speechSynthesis so speech controls can be exercised without audio.
    const utterances: SpeechSynthesisUtterance[] = [];
    const speakTimers: number[] = [];
    let speaking = false;
    let paused = false;

    (globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis = {
      getVoices: () => [],
      onvoiceschanged: null,
      speak: (utterance: SpeechSynthesisUtterance) => {
        utterances.push(utterance);
        speaking = true;
        paused = false;
        // Keep speaking long enough so Pause/Resume can be tested.
        const timerId = globalThis.setTimeout(() => {
          speaking = false;
          utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
        }, 900);
        speakTimers.push(timerId);
      },
      cancel: () => {
        for (const timerId of speakTimers.splice(0)) {
          globalThis.clearTimeout(timerId);
        }
        utterances.length = 0;
        speaking = false;
        paused = false;
      },
      pause: () => {
        paused = true;
      },
      resume: () => {
        paused = false;
      },
      get speaking() {
        return speaking;
      },
      get paused() {
        return paused;
      },
    };

    (
      globalThis as unknown as {
        __popupMock: { messageLog: Array<{ type: string; xpath?: string }> };
      }
    ).__popupMock = { messageLog };
  });
}

test("speech play/pause/resume/stop controls update status", async ({ page }) => {
  await installChromeMock(page);
  await page.goto("http://127.0.0.1:4173/src/entrypoints/popup/index.html");

  // Scan to populate segments.
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("tab", { name: "Articles" }).click();
  await expect(page.getByText("AI is transforming the world")).toBeVisible();

  // Pause and Stop should be reachable from the actions toolbar.
  await expect(page.getByRole("button", { name: "Pause reading", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop reading", exact: true })).toBeVisible();

  // Click Read all — with the stub, speaking starts then finishes quickly.
  await page.getByRole("button", { name: "▶ All" }).click();

  // Pause while speaking.
  await page.getByRole("button", { name: "Pause reading", exact: true }).click();
  await expect(page.getByText("Paused.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume reading", exact: true })).toBeVisible();

  // Resume and then stop.
  await page.getByRole("button", { name: "Resume reading", exact: true }).click();
  await expect(page.getByText("Resumed.")).toBeVisible();
  await page.getByRole("button", { name: "Stop reading", exact: true }).click();
  await expect(page.locator("footer")).toContainText(/Stopped speaking\.|Read completed\./i);
});

test("focus in tab sends highlight message", async ({ page }) => {
  await installChromeMock(page);
  await page.goto("http://127.0.0.1:4173/src/entrypoints/popup/index.html");

  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("tab", { name: "Articles" }).click();
  await expect(page.getByText("AI is transforming the world")).toBeVisible();

  await page.getByRole("button", { name: "Detail →" }).first().click();
  await page.getByRole("button", { name: "Focus in tab" }).click();

  const sentHighlight = await page.evaluate(() => {
    const state = (
      globalThis as unknown as {
        __popupMock?: { messageLog: Array<{ type: string; xpath?: string }> };
      }
    ).__popupMock;
    return Boolean(state?.messageLog.some((message) => message.type === "HIGHLIGHT_SEGMENT"));
  });

  expect(sentHighlight).toBe(true);
});

test("deep scan preset buttons activate correctly", async ({ page }) => {
  await installChromeMock(page);
  await page.goto("http://127.0.0.1:4173/src/entrypoints/popup/index.html");

  // Default is M3 (Balanced should be active).
  const balanced = page.getByRole("button", { name: "Balanced" });
  await expect(balanced).toHaveClass(/is-active/);

  // Click Fast → M2.
  await page.getByRole("button", { name: "Fast" }).click();
  await expect(page.getByRole("button", { name: "Fast" })).toHaveClass(/is-active/);
  await expect(balanced).not.toHaveClass(/is-active/);
  await expect(page.getByText(/Fast.*M2/i)).toBeVisible();

  // Click Deep → M5.
  await page.getByRole("button", { name: "Deep" }).click();
  await expect(page.getByRole("button", { name: "Deep" })).toHaveClass(/is-active/);
  await expect(page.getByText(/Deep.*M5/i)).toBeVisible();
});

test("save, load, reset domain, and reset to global works", async ({ page }) => {
  await installChromeMock(page);
  await page.goto("http://127.0.0.1:4173/src/entrypoints/popup/index.html");

  // Type a custom topic and save preset.
  await page.locator("#topics").fill("react, typescript");
  await page.getByRole("button", { name: "Save preset" }).click();
  await expect(page.getByText(/Preset saved for example\.com/i)).toBeVisible();

  // Load preset confirms it was stored.
  await page.getByRole("button", { name: "Load preset" }).click();
  await expect(page.getByText(/Loaded domain preset/i)).toBeVisible();

  // Change topics locally and clear domain preset.
  await page.locator("#topics").fill("temporary topic");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByText(/Preset cleared for example\.com/i)).toBeVisible();

  // After reset, loading should report missing domain preset.
  await page.getByRole("button", { name: "Load preset" }).click();
  await expect(page.getByText(/No domain preset found/i)).toBeVisible();

  // Reset to global should apply globalSettings topics value from storage.
  await page.getByRole("button", { name: "↩ Global" }).click();
  await expect(page.getByText(/Reset to global preset for example\.com/i)).toBeVisible();
  await expect(page.locator("#topics")).toHaveValue("ai");
});

test("no-domain disables reset actions and save shows warning", async ({ page }) => {
  await installChromeMock(page);
  await page.addInitScript(() => {
    const chromeApi = (globalThis as unknown as { chrome: { tabs: { query: () => Promise<Array<{ id: number }>> } } }).chrome;
    chromeApi.tabs.query = async () => [{ id: 77 }];
  });

  await page.goto("http://127.0.0.1:4173/src/entrypoints/popup/index.html");

  await expect(page.locator(".host-badge")).toHaveText("—");
  await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "↩ Global" })).toBeDisabled();
  await expect(
    page.getByText(/Preset actions disabled — no valid domain\./i),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save preset" }).click();
  await expect(page.getByText(/No domain detected/i)).toBeVisible();
});

test("topic options can be saved via Save link", async ({ page }) => {
  await installChromeMock(page);
  await page.goto("http://127.0.0.1:4173/src/entrypoints/popup/index.html");

  await page.locator("#topics").fill("react, typescript, zustand");
  await page.locator(".save-topics-link").click();
  await expect(page.getByText("Saved topic option.")).toBeVisible();
});

test("local AI settings connect and filter without an OpenAI key", async ({ page }) => {
  await installChromeMock(page);
  await page.route("http://127.0.0.1:11434/api/tags", (route) => route.fulfill({
    json: { models: [{ name: "qwen3.5:9b" }] },
  }));
  await page.route("http://127.0.0.1:11434/api/show", (route) => route.fulfill({
    json: { capabilities: ["completion"] },
  }));
  await page.route("http://127.0.0.1:11434/api/chat", (route) => {
    expect(route.request().headers()).not.toHaveProperty("authorization");
    return route.fulfill({ json: {
      message: { content: JSON.stringify({ scores: [{ id: 1, score: 0.9 }, { id: 2, score: 0.1 }] }) },
    } });
  });
  await page.goto("http://127.0.0.1:4173/src/entrypoints/popup/index.html");
  await page.getByLabel("Filter mode").selectOption("local");
  await expect(page.getByLabel("OpenAI API key")).toHaveCount(0);
  await page.getByRole("button", { name: "Check local AI" }).click();
  await expect(page.getByRole("status")).toContainText("installed");
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.locator("footer")).toContainText("Local AI: 2");
  await page.getByRole("tab", { name: "Articles" }).click();
  await expect(page.getByText("2 total · 1 accepted")).toBeVisible();
});

test("local AI failure visibly falls back to Basic", async ({ page }) => {
  await installChromeMock(page);
  await page.route("http://127.0.0.1:11434/api/chat", (route) => route.abort());
  await page.goto("http://127.0.0.1:4173/src/entrypoints/popup/index.html");
  await page.getByLabel("Filter mode").selectOption("local");
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.locator("footer")).toContainText("dùng lọc cơ bản");
  await page.getByRole("tab", { name: "Articles" }).click();
  await expect(page.getByText("2 total · 2 accepted")).toBeVisible();
});

test("auto scan uses changed topics without toggling the timer", async ({ page }) => {
  await installChromeMock(page);
  await page.goto("http://127.0.0.1:4173/src/entrypoints/popup/index.html");
  await page.getByLabel(/Auto scan/).check();
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.locator("footer")).toContainText("2/2");
  await page.getByLabel("Topics", { exact: true }).fill("astronomy");
  await expect(page.locator("footer")).toContainText("Auto scan: 0/2", { timeout: 7000 });
});

test("delayed cancellation callbacks cannot restart speech or overwrite Stop", async ({ page }) => {
  await installChromeMock(page);
  await page.goto("http://127.0.0.1:4173/src/entrypoints/popup/index.html");
  await page.evaluate(() => {
    const synth = speechSynthesis;
    const originalSpeak = synth.speak.bind(synth);
    const originalCancel = synth.cancel.bind(synth);
    let current: SpeechSynthesisUtterance | undefined;
    synth.speak = (utterance) => { current = utterance; originalSpeak(utterance); };
    synth.cancel = () => {
      const cancelled = current;
      originalCancel();
      setTimeout(() => cancelled?.onerror?.({ error: "canceled" } as SpeechSynthesisErrorEvent), 10);
    };
  });
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("button", { name: "▶ All" }).click();
  await page.getByRole("button", { name: "Stop reading", exact: true }).click();
  await expect(page.locator("footer")).toContainText("Stopped speaking.");
  await page.getByLabel("Topics", { exact: true }).fill("changed while stopped");
  await expect(page.locator("footer")).toContainText("Stopped speaking.");
});
