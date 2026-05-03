import { test, expect } from "@playwright/test";

test("popup page renders React shell", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/src/entrypoints/popup/index.html");

  await expect(page.getByRole("heading", { name: "Topic Reader" })).toBeVisible();
});
