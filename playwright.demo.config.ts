import { defineConfig, devices } from "@playwright/test";

/**
 * Narrated product demo: one test per scene, 1920x1080, slowed down, video always on.
 * Each scene's video is saved as demo-scenes/scene-XX-*.webm (see e2e/demo-tour.spec.ts).
 * Run against a seeded app: `pnpm test:demo`.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /demo-tour\.spec\.ts/,
  grep: /@demo/,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-demo-report" }]],
  outputDir: "test-results-demo",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    locale: "en-GB",
    timezoneId: "Africa/Tunis",
    viewport: { width: 1920, height: 1080 },
    video: { mode: "on", size: { width: 1920, height: 1080 } },
    launchOptions: { slowMo: 250 },
    trace: "off",
  },
  webServer: process.env.E2E_NO_SERVER ? undefined : {
    command: "pnpm start",
    url: `${baseURL}/api/health/live`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
