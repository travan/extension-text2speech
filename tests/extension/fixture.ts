import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";

type App = { context: BrowserContext; worker: Worker; source: Page; reader: Page; tabId: number; origin: string };
export const test = base.extend<{ app: App }>({
  app: async ({}, use, testInfo) => {
    const server = createServer((_request, response) => {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><html><body><article><p>AI researchers build useful tools for processing natural language.</p></article><article><p>Fresh mangoes and oranges are available at the local market today.</p></article></body></html>');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const profile = await mkdtemp(join(tmpdir(), "reader-verification-"));
    let context: BrowserContext | undefined;
    try {
      const extension = resolve("dist");
      context = await chromium.launchPersistentContext(profile, {
        channel: "chromium", headless: process.env.NATIVE_SPEECH_HEADED !== "1", viewport: { width: 420, height: 650 },
        args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension],
      });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      // URL.origin is "null" for custom schemes in Node; retain protocol + host.
      const extensionOrigin = "chrome-extension://" + new URL(worker.url()).host;
      const source = await context.newPage();
      await source.goto("http://127.0.0.1:" + (server.address() as AddressInfo).port + "/fixture");
      const tabId = await worker.evaluate(async () => (await chrome.tabs.query({})).find((t) => t.url?.endsWith("/fixture"))!.id!);
      await worker.evaluate(async () => chrome.storage.local.set({ globalSettings: {
        topics: "AI", threshold: 0.45, filterMode: "basic", autoScanEnabled: false, deepScanEnabled: true,
      } }));
      const reader = await context.newPage();
      await reader.goto(extensionOrigin + "/src/entrypoints/popup/index.html?sourceTabId=" + tabId);
      await expect(reader.locator("footer p")).toContainText("Ready");
      await use({ context, worker, source, reader, tabId, origin: extensionOrigin });
      if (!reader.isClosed()) await reader.screenshot({ path: testInfo.outputPath("reader.png"), fullPage: true });
    } finally {
      if (context) {
        await context.tracing.stop({ path: testInfo.outputPath("trace.zip") });
        await context.close();
      }
      await rm(profile, { recursive: true, force: true });
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  },
});
export { expect };

export async function scan(reader: Page) {
  await reader.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(reader.locator("footer p")).toContainText("Scan complete");
  await reader.getByRole("tab", { name: "Articles" }).click();
}
