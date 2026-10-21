import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import manifest from "./src/manifest";

export default defineConfig({
  plugins: [crx({ manifest }), react()],
  build: {
    rollupOptions: {
      input: {
        popup: "src/entrypoints/popup/index.html",
        results: "src/entrypoints/results/index.html",
      },
    },
  },
});
