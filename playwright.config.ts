import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running, SEEDED app (`pnpm db:seed` then `pnpm build && pnpm start`).
 * In CI the server is started by the workflow; locally `webServer` starts `pnpm start` if nothing is listening.
 * The slow narrated demo tour (@demo) is excluded here; see playwright.demo.config.ts.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: /demo-tour.*\.spec\.ts/,
  grepInvert: /@demo/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }], ["github"]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    locale: "en-GB",
    timezoneId: "Africa/Tunis",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "on",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_NO_SERVER ? undefined : {
    command: "pnpm start",
    url: `${baseURL}/api/health/live`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
