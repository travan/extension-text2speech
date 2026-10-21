import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const evidence = process.env.VERIFICATION_DIR;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: evidence ? resolve(evidence, "e2e-artifacts") : "test-results/e2e",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: evidence ? [
    ["list"],
    ["json", { outputFile: resolve(evidence, "e2e.json") }],
    ["html", { outputFolder: resolve(evidence, "e2e-html"), open: "never" }],
  ] : "list",
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: true,
    timeout: 120000,
  },
  use: {
    headless: true,
    trace: "on",
    screenshot: "only-on-failure",
  },
});
