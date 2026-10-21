import { writeVerificationReport } from "./verification-report.mjs";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import os from "node:os";

const root = process.cwd();
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const directory = resolve("artifacts/verification", stamp);
mkdirSync(directory, { recursive: true });
const sha = (value) => createHash("sha256").update(value).digest("hex");
function inputHashes() {
  const files = [];
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) files.push(child);
    }
  }
  for (const folder of ["src", "tests", "scripts"]) walk(folder);
  files.push(...readdirSync(root).filter((name) => /^(package(-lock)?\.json|tsconfig.*\.json|vite\.config\.ts|playwright.*\.ts)$/.test(name)));
  return Object.fromEntries(files.sort().map((file) => [file, sha(readFileSync(file))]));
}
const initialHashes = inputHashes();
const report = {
  startedAt: new Date().toISOString(), directory, node: process.version,
  platform: os.platform(), arch: os.arch(),
  gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  workingTree: execFileSync("git", ["status", "--short"], { encoding: "utf8" }),
  sourceHashes: initialHashes, sourceDigest: sha(JSON.stringify(initialHashes)), phases: [],
};
writeFileSync(join(directory, "input-hashes.json"), JSON.stringify(initialHashes, null, 2));
function persist() { writeFileSync(join(directory, "manifest.json"), JSON.stringify(report, null, 2)); }
persist();

const phases = [
  ["typecheck", ["run", "typecheck"]],
  ["unit", ["run", "test:unit", "--", "--reporter=default", "--reporter=json", "--outputFile=" + join(directory, "unit.json")]],
  ["transport", ["run", "test:transport", "--", "--reporter=default", "--reporter=json", "--outputFile=" + join(directory, "transport.json")]],
  ["e2e", ["run", "test:e2e"]],
  ["build", ["run", "build"]],
  ["extension", ["exec", "--", "playwright", "test", "--config", "playwright.extension.config.ts"]],
  ["local-smoke", ["run", "test:local-ai", "--", "--reporter=default", "--reporter=json", "--outputFile=" + join(directory, "local-smoke.json")]],
  ["benchmark", ["run", "test:benchmark", "--", "--reporter=default", "--reporter=json", "--outputFile=" + join(directory, "benchmark-tests.json")]],
];
for (const [name, args] of phases) {
  const phase = { name, command: ["npm", ...args], startedAt: new Date().toISOString(), log: name + ".log" };
  report.phases.push(phase);
  persist();
  if (name === "extension" && report.phases.some((p) => p.name === "build" && p.exitCode !== 0)) {
    phase.skipped = "Build failed"; persist(); continue;
  }
  console.log("\nVERIFY " + name);
  const started = performance.now();
  const log = join(directory, phase.log);
  await new Promise((resolve) => {
    const child = spawn("npm", args, {
      cwd: root, env: { ...process.env, VERIFICATION_DIR: directory }, stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => { phase.timedOut = true; child.kill("SIGTERM"); }, 15 * 60 * 1000);
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
      appendFileSync(log, chunk); process.stdout.write(chunk);
    });
    child.on("error", (error) => { phase.error = error.message; });
    child.on("close", (code, signal) => {
      clearTimeout(timer); phase.exitCode = code; phase.signal = signal;
      phase.durationMs = Math.round(performance.now() - started);
      phase.endedAt = new Date().toISOString(); persist(); resolve();
    });
  });
}
report.endedAt = new Date().toISOString();
report.sourcesUnchanged = JSON.stringify(inputHashes()) === JSON.stringify(initialHashes);
report.passed = report.sourcesUnchanged && report.phases.every((p) => p.exitCode === 0 && !p.skipped);
writeVerificationReport(directory, report);
const artifacts = {};
function hashArtifacts(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const file = join(folder, entry.name);
    if (entry.isDirectory()) hashArtifacts(file);
    else if (entry.isFile() && !["manifest.json", "artifact-hashes.json"].includes(entry.name))
      artifacts[relative(directory, file)] = sha(readFileSync(file));
  }
}
hashArtifacts(directory);
writeFileSync(join(directory, "artifact-hashes.json"), JSON.stringify(artifacts, null, 2));
persist();
writeFileSync(resolve("artifacts/verification/latest.json"), JSON.stringify({ directory, passed: report.passed }, null, 2));
console.log("\nEvidence: " + directory + "\nOverall: " + (report.passed ? "PASS" : "FAIL"));
process.exitCode = report.passed ? 0 : 1;
