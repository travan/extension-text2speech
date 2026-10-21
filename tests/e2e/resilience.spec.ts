import { test, expect } from "@playwright/test";
import { installVerificationMock, popupUrl } from "./helpers/verificationMock";

test("slow storage hydration never overwrites persisted settings with defaults", async ({ page }) => {
  await installVerificationMock(page, { storageDelayMs: 800, settings: { topics: "saved astronomy", filterMode: "local" } });
  await page.clock.install();
  await page.goto(popupUrl);
  await page.clock.runFor(400);
  expect(await page.evaluate(() => (globalThis as any).__verificationMock.writes)).toEqual([]);
  await page.clock.runFor(900);
  await expect(page.getByLabel("Topics", { exact: true })).toHaveValue("saved astronomy");
  await expect(page.getByLabel("Filter mode")).toHaveValue("local");
  const writes = await page.evaluate(() => (globalThis as any).__verificationMock.writes);
  expect(writes.filter((w: any) => w.globalSettings).every((w: any) => w.globalSettings.topics === "saved astronomy")).toBe(true);
});

test("an in-flight AI scan cannot overwrite a newer topic configuration", async ({ page }) => {
  await installVerificationMock(page, { settings: { filterMode: "local" } });
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/chat", async (route) => {
    await held;
    await route.fulfill({ json: { message: { content: JSON.stringify({ scores: [{ id: 1, score: 0.9 }, { id: 2, score: 0.9 }] }) } } });
  });
  await page.goto(popupUrl);
  const requested = page.waitForRequest("**/api/chat");
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await requested;
  await page.getByLabel("Topics", { exact: true }).fill("astronomy");
  release();
  await expect(page.locator("footer p")).toContainText("Settings changed during scan");
  await page.getByRole("tab", { name: "Articles" }).click();
  await expect(page.getByText("0 total · 0 accepted")).toBeVisible();
});

test("auto-scan does not overlap AI requests or re-infer unchanged content", async ({ page }) => {
  await installVerificationMock(page, { settings: { filterMode: "local", autoScanEnabled: true } });
  await page.clock.install();
  let calls = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/chat", async (route) => {
    calls++;
    await held;
    await route.fulfill({ json: { message: { content: JSON.stringify({ scores: [{ id: 1, score: 0.9 }, { id: 2, score: 0.1 }] }) } } });
  });
  await page.goto(popupUrl);
  const requested = page.waitForRequest("**/api/chat");
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await requested;
  await page.clock.runFor(6000);
  expect(calls).toBe(1);
  expect(await page.evaluate(() => (globalThis as any).__verificationMock.messages.filter((m: any) => m.type === "EXTRACT_SEGMENTS").length)).toBe(1);
  release();
  await expect(page.locator("footer p")).toContainText("Local AI:");
  await page.clock.runFor(6000);
  expect(calls).toBe(1);
  expect(await page.evaluate(() => (globalThis as any).__verificationMock.messages.filter((m: any) => m.type === "EXTRACT_SEGMENTS").length)).toBeGreaterThan(1);
});

test("auto-scan retries a failed local inference instead of caching fallback", async ({ page }) => {
  await installVerificationMock(page, { settings: { filterMode: "local", autoScanEnabled: true } });
  await page.clock.install();
  let calls = 0;
  await page.route("**/api/chat", (route) => {
    calls++;
    return calls === 1 ? route.fulfill({ status: 503, body: "unavailable" })
      : route.fulfill({ json: { message: { content: JSON.stringify({ scores: [{ id: 1, score: 0.9 }, { id: 2, score: 0.1 }] }) } } });
  });
  await page.goto(popupUrl);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.locator("footer p")).toContainText("dùng lọc cơ bản");
  await page.clock.runFor(2200);
  await expect(page.locator("footer p")).toContainText("Local AI:");
  expect(calls).toBe(2);
});

test("content extraction errors preserve the previous result instead of reporting an empty success", async ({ page }) => {
  await installVerificationMock(page);
  await page.goto(popupUrl);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.locator("footer p")).toContainText("2/2");
  await page.evaluate(() => { (globalThis as any).__verificationMock.extractError = true; });
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.locator("footer p")).toContainText("Scan failed");
  await page.getByRole("tab", { name: "Articles" }).click();
  await expect(page.getByText("2 total · 2 accepted")).toBeVisible();
});

test("selection and item voice survive a rescan", async ({ page }) => {
  await installVerificationMock(page);
  await page.goto(popupUrl);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("tab", { name: "Articles" }).click();
  await page.getByLabel("Include").first().uncheck();
  await page.getByRole("button", { name: "Detail →" }).first().click();
  await page.getByLabel("Voice (this item)").selectOption("Test English");
  await page.getByRole("tab", { name: "Articles" }).click();
  await page.getByRole("button", { name: "↻ Refresh" }).click();
  await expect(page.getByLabel("Include").first()).not.toBeChecked();
  await page.getByRole("button", { name: "Detail →" }).first().click();
  await expect(page.getByLabel("Voice (this item)")).toHaveValue("Test English");
});

test("read all with every item excluded does not start speech", async ({ page }) => {
  await installVerificationMock(page);
  await page.goto(popupUrl);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("tab", { name: "Articles" }).click();
  for (const checkbox of await page.getByLabel("Include").all()) await checkbox.uncheck();
  await page.getByRole("button", { name: "▶ All" }).click();
  await expect(page.locator("footer p")).toContainText("Select at least one");
  expect(await page.evaluate(() => (globalThis as any).__verificationMock.utterances.length)).toBe(0);
});

test("speech error stops the queue and never claims successful completion", async ({ page }) => {
  await installVerificationMock(page);
  await page.goto(popupUrl);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("button", { name: "▶ All" }).click();
  await page.evaluate(() => {
    const utterance = (globalThis as any).__verificationMock.utterances[0];
    utterance.onerror({ error: "synthesis-failed" });
    utterance.onend();
  });
  await expect(page.locator("footer p")).toContainText("Speech failed");
  expect(await page.evaluate(() => (globalThis as any).__verificationMock.utterances.length)).toBe(1);
});

test("an explicitly chosen English voice uses its own language", async ({ page }) => {
  await installVerificationMock(page);
  await page.goto(popupUrl);
  await page.locator(".voice-select").selectOption("Test English");
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("button", { name: "▶ All" }).click();
  expect(await page.evaluate(() => (globalThis as any).__verificationMock.utterances[0].lang)).toBe("en-US");
});

test("local connection check distinguishes POST permission failure from model discovery", async ({ page }) => {
  await installVerificationMock(page, { settings: { filterMode: "local" } });
  await page.route("**/api/tags", (route) => route.fulfill({ json: { models: [{ name: "qwen3.5:9b" }] } }));
  await page.route("**/api/show", (route) => route.fulfill({ status: 403, body: "" }));
  await page.goto(popupUrl);
  await page.getByRole("button", { name: "Check local AI" }).click();
  await expect(page.getByRole("status")).toContainText("OLLAMA_ORIGINS");
  await expect(page.getByRole("status")).not.toContainText("installed");
});
