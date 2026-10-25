import { test, expect, scan } from "./fixture";

test("real extraction excludes hidden elements and does not duplicate nested article text", async ({ app }) => {
  await app.source.evaluate(() => {
    const hidden = document.createElement("article");
    hidden.style.display = "none";
    hidden.textContent = "AI HIDDEN_SECRET should never become a visible excerpt.";
    document.body.append(hidden);
  });
  const response = await app.worker.evaluate(async (tabId) =>
    chrome.tabs.sendMessage(tabId, { type: "EXTRACT_SEGMENTS", scope: "page", exhaustive: true }), app.tabId);
  expect(response.ok).toBe(true);
  expect(response.segments).toHaveLength(2);
  expect(new Set(response.segments.map((s: any) => s.text)).size).toBe(2);
  expect(JSON.stringify(response.segments)).not.toContain("HIDDEN_SECRET");
  await scan(app.reader);
  await expect(app.reader.getByText("2 total · 1 accepted")).toBeVisible();
});

test("long article extraction and hydration preserve the final sentence", async ({ app }) => {
  const text = "AI researchers study language and build tools for useful predictions. ".repeat(45) + "FINAL_SENTENCE_123.";
  await app.source.evaluate((text) => {
    document.body.innerHTML = "<article><p></p></article>";
    document.querySelector("p")!.textContent = text;
  }, text);
  await scan(app.reader);
  await app.reader.getByRole("button", { name: "Detail →" }).first().click();
  await expect(app.reader.locator(".detail-text")).toContainText("FINAL_SENTENCE_123");
  expect((await app.reader.locator(".detail-text").innerText()).length).toBeGreaterThan(3000);
});

test("real session storage restores selected results after the reader reloads", async ({ app }) => {
  await scan(app.reader);
  await app.reader.getByLabel("Include").uncheck();
  await expect.poll(async () => app.worker.evaluate(async (tabId) => {
    const key = "popupScanState:" + tabId;
    return (await chrome.storage.session.get(key))[key]?.segments?.[0]?.selected;
  }, app.tabId)).toBe(false);
  await app.reader.reload();
  await expect(app.reader.locator("footer p")).toContainText("Restored 1");
  await app.reader.getByRole("tab", { name: "Articles" }).click();
  await expect(app.reader.getByLabel("Include")).not.toBeChecked();
});

test("dynamic feed capture collects a new post once and stops collecting after Stop", async ({ app }) => {
  await app.reader.getByRole("button", { name: "Start capture", exact: true }).click();
  await expect(app.reader.locator("footer p")).toContainText("Capture started");
  const items = () => app.worker.evaluate(async (tabId) => {
    const key = "captureResults_" + tabId;
    return (await chrome.storage.local.get(key))[key]?.items ?? [];
  }, app.tabId);
  await expect.poll(async () => (await items()).length).toBe(1);
  await app.source.evaluate(() => {
    const article = document.createElement("article");
    article.textContent = "AI NEW_DYNAMIC_POST explores neural network training and language generation.";
    document.body.append(article);
  });
  await expect.poll(async () => (await items()).length, { timeout: 10000 }).toBe(2);
  // Restart re-extracts the same DOM and hydrates persisted records.
  await app.worker.evaluate(async (tabId) => chrome.tabs.sendMessage(tabId, { type: "START_CAPTURE", tabId, topics: ["AI"], threshold: 0.45 }), app.tabId);
  expect((await items()).length).toBe(2);
  await app.worker.evaluate(async (tabId) => chrome.tabs.sendMessage(tabId, { type: "STOP_CAPTURE" }), app.tabId);
  await app.source.evaluate(() => {
    const article = document.createElement("article");
    article.textContent = "AI AFTER_STOP discusses a new model that must not be captured.";
    document.body.append(article);
  });
  const state = await app.worker.evaluate(async (tabId) => chrome.tabs.sendMessage(tabId, { type: "GET_CAPTURE_STATE" }), app.tabId);
  expect(state.active).toBe(false);
  // Negative temporal assertion: wait past the normal 5s capture interval.
  await app.source.waitForTimeout(5500);
  const saved = await items();
  expect(saved).toHaveLength(2);
  expect(new Set(saved.map((item: any) => item.key)).size).toBe(2);
  expect(JSON.stringify(saved)).not.toContain("AFTER_STOP");
});

test("results paginate real stored records and retain the correct source tab", async ({ app }) => {
  await app.worker.evaluate(async (tabId) => {
    const items = Array.from({ length: 55 }, (_, i) => ({
      key: "record-" + i, id: i + 1, text: "AI stored record " + (i + 1),
      score: 0.8, xpath: "/html/body/article[1]", capturedAt: 1000 - i,
    }));
    await chrome.storage.local.set({ ["captureResults_" + tabId]: { items } });
  }, app.tabId);
  const results = await app.context.newPage();
  await results.goto(app.origin + "/src/entrypoints/results/index.html?tabId=" + app.tabId);
  await expect(results.getByText("Loaded 55 records.")).toBeVisible();
  await expect(results.locator(".card")).toHaveCount(50);
  await results.getByRole("button", { name: "Next", exact: true }).click();
  await expect(results.locator(".card")).toHaveCount(5);
  await expect(results.locator(".card").first()).toContainText("AI stored record 51");
  await results.getByLabel("Rows per page").selectOption("20");
  await expect(results.locator(".card")).toHaveCount(20);
  await expect(results.getByText("Page 1/3")).toBeVisible();
  await expect(results.getByLabel("Source tab id")).toHaveValue(String(app.tabId));
});

test("switching the reader to another source tab never restores the first tab's results", async ({ app }) => {
  await scan(app.reader);
  await expect.poll(async () => app.worker.evaluate(async (tabId) =>
    Boolean((await chrome.storage.session.get("popupScanState:" + tabId))["popupScanState:" + tabId]), app.tabId)).toBe(true);
  const other = await app.context.newPage();
  await other.goto(app.source.url() + "?other=1");
  const otherId = await app.worker.evaluate(async () =>
    (await chrome.tabs.query({})).find((t) => t.url?.includes("?other=1"))!.id!);
  await app.reader.goto(app.origin + "/src/entrypoints/popup/index.html?sourceTabId=" + otherId);
  await expect(app.reader.locator("footer p")).toContainText("Ready");
  await app.reader.getByRole("tab", { name: "Articles" }).click();
  await expect(app.reader.getByText("0 total · 0 accepted")).toBeVisible();
});
