import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const evidence = process.env.VERIFICATION_DIR;

export default defineConfig({
  testDir: "tests/extension",
  // Native speech needs installed OS voices and plays audible sample text.
  testIgnore: process.env.NATIVE_SPEECH_HEADED === "1" ? undefined : "**/native-speech.spec.ts",
  timeout: 180000,
  workers: 1,
  reporter: evidence ? [
    ["list"],
    ["json", { outputFile: resolve(evidence, "extension.json") }],
    ["html", { outputFolder: resolve(evidence, "extension-html"), open: "never" }],
  ] : "list",
  outputDir: evidence ? resolve(evidence, "extension-artifacts") : "test-results/extension",
});
