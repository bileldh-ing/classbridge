import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn, signInStaff } from "./helpers";

test("non-staff get a real 403 on admin pages", async ({ page }) => {
  await signIn(page, ACCOUNTS.student);
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(403);
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});

test("admin passes TOTP, approves a pending teacher and the decision is in the audit log", async ({ page }) => {
  await signInStaff(page, ACCOUNTS.admin);
  await page.goto("/admin/teachers");
  const card = page.locator("section").filter({ hasText: "Profiles awaiting review" }).locator("div.mb-3").filter({ hasText: "Pierre" }).first();
  await expect(card).toBeVisible();
  await card.getByPlaceholder(/Reason/).fill("Profile complete; credentials checked (e2e)");
  await card.getByRole("button", { name: "Approve & publish" }).click();
  await expect(page.locator("section").filter({ hasText: "Profiles awaiting review" }).getByText("Pierre")).toHaveCount(0, { timeout: 15_000 });
  await page.goto("/admin/audit");
  await expect(page.getByText("teacher.profile_approved").first()).toBeVisible();
  const pub = await page.goto("/teachers/pierre-demo-8");
  expect(pub?.status()).toBe(200);
});

test("support queue shows internal notes only to staff", async ({ browser }) => {
  const staff = await browser.newContext();
  const sp = await staff.newPage();
  await signInStaff(sp, ACCOUNTS.support);
  await sp.goto("/admin/support");
  await sp.getByRole("link", { name: /How do I join my trial lesson/ }).click();
  await expect(sp.getByText(/Internal: user has a confirmed trial lesson/)).toBeVisible();
  const url = sp.url();
  await staff.close();
  const learner = await browser.newContext();
  const lp = await learner.newPage();
  await signIn(lp, ACCOUNTS.student);
  await lp.goto(url.replace("/admin/support/", "/support/"));
  await expect(lp.getByText(/classroom button appears on the lesson page/)).toBeVisible();
  await expect(lp.getByText(/Internal: user has a confirmed trial lesson/)).toHaveCount(0);
  await learner.close();
});
