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
    watch: {
      // 忽略编辑器原子保存产生的临时文件/目录，避免 EBUSY 噪声。
      ignored: ["**/*.tmp", "**/*.tmpdir/**"],
    },
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
