import { test, expect } from "@playwright/test";

test("results flow loads items and goto action is clickable", async ({ page }) => {
  await page.addInitScript(() => {
    const store: Record<string, unknown> = {
      captureResults_12: {
        items: [
          {
            key: "xpath1::ai",
            id: 1,
            xpath: "/a",
            text: "AI item",
            score: 0.78,
            matchedKeywords: ["ai"],
            firstSeenAt: Date.now(),
            lastSeenAt: Date.now(),
            capturedAt: Date.now(),
          },
        ],
      },
    };

    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: {
        sendMessage: async () => ({ ok: true }),
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

  await page.goto("http://127.0.0.1:4173/src/entrypoints/results/index.html");
  await page.getByLabel("Source tab id").fill("12");
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Loaded 1 records.")).toBeVisible();
  await expect(page.getByText("AI item")).toBeVisible();
  await page.getByRole("button", { name: "Goto" }).click();
  await expect(page.getByText("Keywords: ai")).toBeVisible();
});
