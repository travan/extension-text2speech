# Topic-Aware Text Reader (Chrome Extension)

A Chrome Extension that scans visible content on any page, filters relevant segments by topic, and reads them aloud with configurable voices.

This repository contains the current React + TypeScript implementation and keeps legacy MVP files in a separate folder for side-by-side comparison.

## Key Features

- Topic-based text scanning and filtering on web pages
- Hybrid ranking (keyword + semantic/embedding scoring)
- Beginner mode that works without an OpenAI API key
- Optional advanced AI mode with OpenAI API key
- Local AI topic scoring with an installed Ollama chat model (no API key)
- Per-item voice selection before playback
- Domain presets (topic, threshold, mode, model, default voice)
- Feed auto-scan for dynamic social feeds (Threads, Facebook, X)
- Dedicated results page with pagination and jump-to-segment
- Popup UI with configuration and results tabs
- Speech controls: pause, resume, and stop

## Tech Stack

- Vite + CRXJS (Manifest V3 build)
- React + TypeScript
- Zustand for popup state management
- Vitest for unit tests
- Playwright for end-to-end tests

## Project Structure

- `src/`: active source code
- `legacy/`: previous MVP implementation kept for reference
- `dist/`: build output for loading into Chrome (generated)

## Getting Started

### Prerequisites

- Node.js 20+ (recommended)
- npm
- Google Chrome

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Type Check

```bash
npm run typecheck
```

### Build

```bash
npm run build
```

## Run Tests

```bash
npm run test:unit
npm run test:e2e:smoke
npm run test:e2e:flow
```

Run full E2E suite:

```bash
npm run test:e2e
```

Test a running local Ollama instance and installed `qwen3.5:9b`:

```bash
npm run test:local-ai
npm run test:extension
```

The first command compares Basic and Local AI on 16 synthetic Vietnamese/English
examples and writes `test-results/local-ai-evaluation.json`. Override
`LOCAL_AI_MODEL` and `LOCAL_AI_URL` for this evaluation if needed.
The second builds and loads the real extension into an isolated Chromium profile,
extracts a local fixture page, and calls Ollama from the extension origin. No
personal browsing data is used. These integration tests require Ollama; the unit
and normal E2E suites use mocks and work without it.

## Load Extension in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `dist/` folder (after `npm run build`).
5. Open any website and click the extension icon.

## Usage Guide

### Quick Start (No API Key)

1. Keep filter mode in beginner/basic mode.
2. Enter one or more topics.
3. Click scan/filter, then click read.

Topic input supports separators such as commas, semicolons, or new lines.

### Advanced AI Mode (Optional)

1. Switch to advanced AI mode.
2. Provide your OpenAI API key.
3. Start scanning/filtering.

If no API key is provided, the extension falls back to basic filtering.

### Local AI (Ollama)

1. Run Ollama on `http://127.0.0.1:11434` with an installed chat model.
2. In Settings, choose **Local AI (Ollama)**.
3. Enter the model name (default: `qwen3.5:9b`) and click **Check local AI**.
4. Enter topics, then click **Scan**. The footer identifies Local AI or explains
   when Basic fallback was used.

Local AI scores relevance to any of your topics, including related wording in
Vietnamese or English. Only loopback endpoints are accepted. Requests contain
topics and up to 40 excerpts (1,200 characters each), processed in batches of
eight, with a two-minute scan deadline. Other excerpts retain Basic scores; the
footer states this limit. Local AI never sends your OpenAI key and never
automatically switches to a cloud provider. Its threshold is applied strictly.
**Check local AI** checks connectivity/model installation; **Scan** tests inference.

The integration follows the [Ollama chat API](https://docs.ollama.com/api/chat)
and [structured output API](https://docs.ollama.com/capabilities/structured-outputs).
If your Ollama installation rejects an extension origin, consult
[Ollama's origin configuration](https://docs.ollama.com/faq); allow the specific
extension origin instead of exposing the server to the network.

Local AI applies to popup scans, including auto-scan while the reader is open.
Feed capture continues to use Basic filtering. Text-to-speech still uses the
browser/device voices; the local model does not generate audio.

### Domain Presets

1. Configure settings on a target domain (for example, threads.com).
2. Save a domain preset.
3. Reload the preset later for fast reuse.

### Feed Capture Workflow

1. Start feed capture from the popup.
2. Continue browsing/scrolling the source feed tab.
3. Open the results page to review captured segments.
4. Use pagination, tracking controls, and jump-to-segment navigation.

## Current Limitations

- Semantic scoring may consume API tokens.
- To control cost, semantic scoring is capped per scan.
- Speech quality depends on local browser/device `speechSynthesis` voices.
- AI classification is probabilistic; the small local evaluation is a smoke
  benchmark, not a guarantee of accuracy on all sites.
- Deep-scan levels currently do not control scrolling/expansion; only the
  deep-scan toggle changes extraction. Automatic scrolling/clicking is disabled.
- Captured feeds are capped at 5,000 records, but large records can still hit
  Chrome's storage quota.

See [the review and verification notes](docs/REVIEW-2026-10-20.md).

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Reproducible verification

Run the complete verification suite with `npm run verify`. It requires a running
Ollama instance with `qwen3.5:9b`, permission for the unpacked extension origin,
and Playwright Chromium installed. It runs type checking, unit tests, real local
HTTP failure tests, browser UI tests, a production build, real extension tests,
the original 16-example smoke check, and the expanded relevance benchmark.

Every run writes a new timestamped folder under `artifacts/verification/` with
commands, exit codes, durations, source/data SHA-256 hashes, JSON reports,
Playwright HTML reports, screenshots and traces. `latest.json` points to the
latest run and states whether all phases passed. Failed runs are retained.
The runner exits nonzero if any phase fails, is skipped, or source files change
during the run. Build precedes extension verification; no personal Chrome
profile is used.

The expanded corpus is `tests/fixtures/relevance-v1.json`: 96 distinct synthetic
examples across eight topic groups, scored twice with reversed input tie order
(the production ranker still prioritizes lexical scores). That is 192 model
decisions, not 192 independently sourced documents. Labels and release gates
are fixed before execution: precision/recall >=90%, per-group accuracy >=75%,
and agreement across orders >=95%. Reports preserve every score and mistake.
These are agent-authored cases, not independently human-annotated live feeds.

Individual commands:

```bash
npm run test:unit
npm run test:transport
npm run test:e2e
npm run test:extension
npm run test:local-ai
npm run test:benchmark
```

`test:transport` uses a synthetic HTTP server with real sockets; only its timeout
budget is shortened for the timeout test. UI E2E tests mock Chrome, speech and
Ollama. The extension suite uses real Chromium extension APIs, real DOM and
storage, and one real Ollama inference flow. Speech tests verify queue behavior,
not audible voice quality.

### Native speech E2E

`npm run test:speech:native` opens Chromium with the built extension and plays
short sample articles through the real OS speech engine. It requires installed
local English (`en-US`) and Vietnamese (`vi`) voices and fails if either is
missing. The three tests check two-article completion, pause/resume/stop without
advancing the queue, and Vietnamese single-article completion. Native events are
observed while all synthesis calls are forwarded to the browser; no voice or
utterance mock is used. Each test attaches the voice inventory and native event
log. This verifies engine execution, not perceived pronunciation or speaker
volume. It runs separately from the default headless verification suite.

To retain JSON, HTML and traces, set `VERIFICATION_DIR` to a new evidence folder
when running the command.
