import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "e2e_artifacts/html-report", open: "never" }]],
  use: {
    baseURL: "http://localhost:8000",
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  outputDir: "e2e_artifacts/test-results",
});
