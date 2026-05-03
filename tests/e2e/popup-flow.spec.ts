import { test, expect } from "@playwright/test";

test("popup scan flow works with mocked chrome API", async ({ page }) => {
  await page.addInitScript(() => {
    const store: Record<string, unknown> = {
      globalSettings: {
        topics: "ai, startup",
        threshold: 0.45,
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

    // Minimal chrome mock for popup logic.
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        getURL: (path: string) => `http://127.0.0.1:4173/${path}`,
      },
      tabs: {
        query: async () => [{ id: 12, url: "https://threads.net/home" }],
        sendMessage: async (_tabId: number, message: { type: string }) => {
          if (message.type === "EXTRACT_SEGMENTS") {
            return {
              ok: true,
              segments: [
                { id: 1, text: "AI startup raises funding", xpath: "/a" },
                { id: 2, text: "sports update", xpath: "/b" },
              ],
            };
          }
          if (message.type === "GET_FULL_SEGMENT_TEXT") {
            return { ok: true, text: "AI startup raises funding with full context" };
          }
          return { ok: true };
        },
        create: async () => ({}),
        update: async () => ({}),
      },
      storage: {
        local: {
          get: async (keys?: string | string[] | null) => {
            if (!keys) {
              return store;
            }
            if (typeof keys === "string") {
              return { [keys]: store[keys] };
            }
            const out: Record<string, unknown> = {};
            for (const key of keys) {
              out[key] = store[key];
            }
            return out;
          },
          set: async (payload: Record<string, unknown>) => {
            Object.assign(store, payload);
          },
          remove: async (_keys: string | string[]) => {},
        },
      },
    };
  });

  await page.goto("http://127.0.0.1:4173/src/entrypoints/popup/index.html");

  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("tab", { name: "Articles" }).click();
  await expect(page.getByText("AI startup raises funding")).toBeVisible();
  await expect(page.getByText("2 total · 1 accepted")).toBeVisible();

  await page.getByRole("button", { name: "Detail →" }).first().click();
  await expect(page.locator(".detail-view")).toBeVisible();
});

test("hydrate-full-text updates detail panel text", async ({ page }) => {
  await page.addInitScript(() => {
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
        query: async () => [{ id: 55, url: "https://example.com/post" }],
        sendMessage: async (_tabId: number, message: { type: string; xpath?: string }) => {
          if (message.type === "EXTRACT_SEGMENTS") {
            return {
              ok: true,
              segments: [{ id: 1, text: "Short AI excerpt", xpath: "/div[1]" }],
            };
          }
          if (message.type === "GET_FULL_SEGMENT_TEXT") {
            return { ok: true, text: "Short AI excerpt — expanded with full context and additional detail." };
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
          set: async (payload: Record<string, unknown>) => { Object.assign(store, payload); },
          remove: async () => {},
        },
      },
    };
  });

  await page.goto("http://127.0.0.1:4173/src/entrypoints/popup/index.html");

  // Scan to get the segment.
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("tab", { name: "Articles" }).click();
  await expect(page.getByText("Short AI excerpt")).toBeVisible();

  // Open detail panel — this also triggers hydrate.
  await page.getByRole("button", { name: "Detail →" }).first().click();
  await expect(page.locator(".detail-view")).toBeVisible();

  // After hydration, the expanded text should appear in the detail panel.
  await expect(
    page.locator(".detail-view").getByText(/expanded with full context/i),
  ).toBeVisible({ timeout: 4000 });
});
