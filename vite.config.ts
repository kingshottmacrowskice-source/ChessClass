import livePlugin from "./scripts/live-service.mjs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import positionCachePlugin from "./scripts/position-cache-plugin.mjs";
import modelServicePlugin from "./scripts/model-service.mjs";
import openingBookPlugin from "./scripts/opening-book.mjs";
export default defineConfig({
  plugins: [
    react(),
    livePlugin(),
    positionCachePlugin(),
    modelServicePlugin(),
    openingBookPlugin(),
  ],
  server: {
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/data/**",
        "**/server/**",
      ],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
