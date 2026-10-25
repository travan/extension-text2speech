import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import manifest from "./src/manifest";

export default defineConfig(({ command }) => ({
  plugins: [crx({ manifest }), react()],
  build: {
    outDir: command === "serve" ? ".dev-extension" : "dist",
    rollupOptions: {
      input: {
        popup: "src/entrypoints/popup/index.html",
        results: "src/entrypoints/results/index.html",
      },
    },
  },
}));
