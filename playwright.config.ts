import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 90000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5174",
    browserName: "chromium",
    channel: "msedge",
    headless: true,
  },
  webServer: {
    command: "npm run dev -- --port 5174 --strictPort --mode cache-test",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
  },
});
