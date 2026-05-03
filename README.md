# Topic-Aware Text Reader (Chrome Extension)

A Chrome Extension that scans visible content on any page, filters relevant segments by topic, and reads them aloud with configurable voices.

This repository contains the current React + TypeScript implementation and keeps legacy MVP files in a separate folder for side-by-side comparison.

## Key Features

- Topic-based text scanning and filtering on web pages
- Hybrid ranking (keyword + semantic/embedding scoring)
- Beginner mode that works without an OpenAI API key
- Optional advanced AI mode with OpenAI API key
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

## License

This project is licensed under the MIT License. See the LICENSE file for details.
