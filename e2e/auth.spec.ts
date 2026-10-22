import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, signIn, uniqueEmail } from "./helpers";

test("sign up a new learner, sign out, sign back in", async ({ page }) => {
  const email = uniqueEmail("signup");
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Learner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("CorrectHorse42!");
  for (const box of await page.locator("main form input[type=checkbox]").all()) {
    const label = (await box.locator("xpath=..").innerText()).toLowerCase();
    if (!label.includes("news") && !label.includes("marketing") && !label.includes("tips")) await box.check();
  }
  await page.locator("main form").getByRole("button", { name: "Join free" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/dashboard"));
  await signIn(page, email, "CorrectHorse42!");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("wrong password is rejected with a generic message", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Email").fill("student@classbridge.test");
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD + "x");
  await page.locator("main form").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});
