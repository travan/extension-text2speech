import { chromium, expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import type { AddressInfo } from "node:net";

test("built extension extracts a real page and filters through real Ollama", async ({}, testInfo) => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><body>
      <article><p>Large language models learn patterns from data and generate text to assist programmers.</p></article>
      <article><p>Ngày mai tôi đi chợ mua trái cây và nấu bữa tối cho gia đình.</p></article>
    </body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const profile = await mkdtemp(join(tmpdir(), "topic-reader-test-"));
  const extension = resolve("dist");
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true,
    viewport: { width: 420, height: 600 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const source = await context.newPage();
    await source.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/fixture`);
    const sourceTabId = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      return tabs.find((tab) => tab.url?.endsWith("/fixture"))!.id!;
    });
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ globalSettings: {
        topics: "trí tuệ nhân tạo", threshold: 0.45, filterMode: "local",
        localAiUrl: "http://127.0.0.1:11434", localAiModel: "qwen3.5:9b",
        autoScanEnabled: false, deepScanEnabled: true,
      } });
    });
    // Real extension origin, storage, tabs, content script and network; no Chrome/fetch mocks.
    const reader = await context.newPage();
    await reader.goto(`chrome-extension://${extensionId}/src/entrypoints/popup/index.html?sourceTabId=${sourceTabId}`);
    await expect(reader.locator(".host-badge")).toHaveText("127.0.0.1");
    await reader.getByRole("button", { name: "Check local AI" }).click();
    await expect(reader.getByRole("status")).toContainText("installed", { timeout: 10000 });
    await reader.getByRole("button", { name: "Scan", exact: true }).click();
    await expect(reader.locator("footer p")).toContainText("Scan complete", { timeout: 125000 });
    await expect(reader.locator("footer p")).toContainText("Local AI:");
    await expect(reader.locator("footer p")).not.toContainText("không khả dụng");
    await reader.getByRole("tab", { name: "Articles" }).click();
    await expect(reader.getByText("Large language models", { exact: false })).toBeVisible();
    await expect(reader.getByText("Ngày mai tôi đi chợ", { exact: false })).toHaveCount(0);
    await expect(reader.getByText("2 total · 1 accepted")).toBeVisible();
    await reader.getByRole("button", { name: "Detail →" }).click();
    await expect(reader.locator(".detail-text")).toContainText("assist programmers");
    await reader.screenshot({ path: testInfo.outputPath("local-ai-detail.png"), fullPage: true });
    await reader.getByRole("tab", { name: "Settings" }).click();
    await reader.getByLabel("Topics", { exact: true }).fill("language models");
    await reader.getByRole("button", { name: "Start capture", exact: true }).click();
    await expect(reader.locator("footer p")).toContainText("Capture started");
    const resultOpened = context.waitForEvent("page");
    await reader.getByRole("button", { name: "Results ↗" }).click();
    const results = await resultOpened;
    await expect(results.getByText("Loaded 1 records.")).toBeVisible();
    await expect(results.locator(".card")).toContainText("Large language models");
    const captured = await worker.evaluate(async (id) => {
      const key = `captureResults_${id}`;
      return (await chrome.storage.local.get(key))[key].items[0];
    }, sourceTabId);
    expect(captured.key).toBeTruthy();
    expect(captured.capturedAt).toBeGreaterThan(0);
    await results.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(results.getByText("Capture storage cleared.")).toBeVisible();
    const captureState = await worker.evaluate(async (id) =>
      chrome.tabs.sendMessage(id, { type: "GET_CAPTURE_STATE" }), sourceTabId);
    expect(captureState.active).toBe(false);
  } finally {
    await context.tracing.stop({ path: testInfo.outputPath("trace.zip") });
    await context.close();
    await rm(profile, { recursive: true, force: true });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
