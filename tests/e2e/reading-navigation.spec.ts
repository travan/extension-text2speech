import { test, expect } from "@playwright/test";
import { installVerificationMock, popupUrl } from "./helpers/verificationMock";

test.beforeEach(async ({ page }) => {
  await installVerificationMock(page);
  await page.addInitScript(() => {
    const state = (window as any).__verificationMock;
    state.segments.push({ id: 3, text: "AI third article continues the reading queue.", xpath: "/p[3]" });
    const calls = { pause: 0, resume: 0, cancel: 0 };
    (window as any).__speechCalls = calls;
    speechSynthesis.pause = () => { calls.pause++; };
    speechSynthesis.resume = () => { calls.resume++; };
    speechSynthesis.cancel = () => { calls.cancel++; };
  });
  await page.goto(popupUrl);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("tab", { name: "Articles" }).click();
});

test("highlights speech boundaries and Play resumes the same utterance and queue", async ({ page }) => {
  await page.getByRole("button", { name: "▶ All", exact: true }).click();
  await page.evaluate(() => {
    (window as any).__verificationMock.utterances[0].onboundary({ charIndex: 3, charLength: 11 });
  });
  await expect(page.locator(".is-reading mark")).toHaveText("researchers");
  await page.getByRole("button", { name: "Pause reading", exact: true }).click();
  await expect(page.locator(".is-paused .reading-badge")).toHaveText("Paused");
  const before = await page.evaluate(() => ({ ...(window as any).__speechCalls }));
  await page.getByRole("button", { name: "▶ Resume", exact: true }).last().click();
  await expect(page.locator("footer")).toContainText("Resumed.");
  await expect(page.locator(".is-reading mark")).toHaveText("researchers");
  const after = await page.evaluate(() => ({ calls: (window as any).__speechCalls, count: (window as any).__verificationMock.utterances.length }));
  expect(after.count).toBe(1);
  expect(after.calls.cancel).toBe(before.cancel);
  expect(after.calls.resume).toBe(before.resume + 1);
  await page.evaluate(() => (window as any).__verificationMock.utterances[0].onend());
  await expect(page.locator(".is-reading")).toContainText("AI systems");
});

test("Next skips excluded segments, ignores cancelled callbacks, and completes at the end", async ({ page }) => {
  await page.locator(".segment-card").nth(1).getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "▶ Read", exact: true }).first().click();
  await page.getByRole("button", { name: "Pause reading", exact: true }).click();
  await page.getByRole("button", { name: "Next segment", exact: true }).click();
  await expect(page.locator(".is-reading")).toContainText("AI third article");
  await expect(page.locator(".is-paused")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next segment", exact: true })).toBeDisabled();
  await page.evaluate(() => {
    const first = (window as any).__verificationMock.utterances[0];
    first.onend();
    first.onerror({ error: "canceled" });
    first.onboundary({ charIndex: 3, charLength: 11 });
  });
  await expect(page.locator(".is-reading")).toContainText("AI third article");
  await expect(page.locator("footer")).toContainText("Speaking next segment.");
  await page.evaluate(() => (window as any).__verificationMock.utterances[1].onend());
  await expect(page.locator("footer")).toContainText("Read completed.");
  await expect(page.locator(".is-reading")).toHaveCount(0);
});

test("Read jumps to an article and continues; Detail shares the highlight; Stop clears it", async ({ page }) => {
  await page.getByRole("button", { name: "▶ All", exact: true }).click();
  await page.getByRole("button", { name: "▶ Read", exact: true }).nth(1).click();
  await expect(page.locator(".is-reading")).toContainText("AI systems");
  await page.locator(".is-reading").getByRole("button", { name: "Detail →" }).click();
  await page.evaluate(() => (window as any).__verificationMock.utterances[1].onboundary({ charIndex: 3, charLength: 7 }));
  await expect(page.locator(".detail-text mark")).toHaveText("systems");
  await page.evaluate(() => (window as any).__verificationMock.utterances[1].onend());
  await expect(page.getByRole("button", { name: "Next segment", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Stop reading", exact: true }).click();
  await expect(page.locator(".reading-text")).toHaveCount(0);
  await expect(page.locator("footer")).toContainText("Stopped speaking.");
});

test("an end callback received while paused waits for Resume before advancing", async ({ page }) => {
  await page.getByRole("button", { name: "▶ All", exact: true }).click();
  await page.getByRole("button", { name: "Pause reading", exact: true }).click();
  await page.evaluate(() => (window as any).__verificationMock.utterances[0].onend());
  await expect(page.locator(".is-paused")).toContainText("AI researchers");
  await page.getByRole("button", { name: "Resume reading", exact: true }).click();
  await expect(page.locator(".is-reading")).toContainText("AI systems");
});
