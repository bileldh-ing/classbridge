import { expect, type Page } from "@playwright/test";
import { base32Encode, totp } from "../src/lib/auth/totp";

export const DEMO_PASSWORD = "DemoPass123!";
export const ACCOUNTS = {
  admin: "admin@classbridge.test",
  support: "support@classbridge.test",
  student: "student@classbridge.test",
  student2: "student2@classbridge.test",
  sara: "sara.demo@classbridge.test",
  amira: "amira.demo@classbridge.test",
};
/** Same fixed DEMO secret the seed enrolls for staff accounts (scripts/seed.ts). Never used outside demo data. */
export const DEMO_TOTP_SECRET = base32Encode(Buffer.from("classbridge-demo-otp"));

export async function signIn(page: Page, email: string, password = DEMO_PASSWORD, next?: string) {
  await page.goto(`/signin${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.locator("main form").getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 30_000 });
}

/** Signs in a staff account and passes the TOTP challenge (required in production builds). */
export async function signInStaff(page: Page, email = ACCOUNTS.admin) {
  await signIn(page, email, DEMO_PASSWORD, "/admin");
  await page.goto("/admin");
  if (new URL(page.url()).pathname === "/mfa") {
    // Codes are single-use per 30 s step: wait for a fresh step if we are near the boundary.
    const msIntoStep = Date.now() % 30_000;
    if (msIntoStep > 25_000) await page.waitForTimeout(30_000 - msIntoStep + 500);
    await page.getByLabel("6-digit code").fill(totp(DEMO_TOTP_SECRET));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL(/\/admin(\?|$|\/)/, { timeout: 30_000 });
  }
  await expect(page).toHaveURL(/\/admin/);
}

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** Same-origin header so cookie-authenticated POSTs pass the CSRF origin check from the API request context. */
export function originHeaders(baseURL: string | undefined) {
  return { Origin: new URL(baseURL ?? "http://localhost:3000").origin, "Content-Type": "application/json" };
}
