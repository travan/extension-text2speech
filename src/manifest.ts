import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Topic-aware Text Reader",
  version: "0.10.0",
  description: "Read web text by topic with domain presets and optional semantic embeddings.",
  permissions: ["activeTab", "scripting", "storage", "tabs", "windows"],
  host_permissions: ["<all_urls>"],
  background: {
    service_worker: "src/entrypoints/background/index.ts",
    type: "module",
  },
  action: {
    default_title: "Topic Reader",
    default_popup: "src/entrypoints/popup/index.html",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/entrypoints/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  web_accessible_resources: [
    {
      resources: ["src/entrypoints/results/index.html"],
      matches: ["<all_urls>"],
    },
  ],
});
