import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";

test.describe("booking flow", () => {
  test("paid lesson reaches checkout with the honest 'payment not configured' state", async ({ page }) => {
    await signIn(page, ACCOUNTS.student2);
    await page.goto("/teachers/lucas-demo-2");
    await page.getByText("60-minute private lesson (Demo)").click();
    const slot = page.locator("button[aria-pressed]").first();
    await expect(slot).toBeVisible({ timeout: 20_000 });
    await slot.click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/lessons\/[0-9a-f-]+\/checkout/);
    await expect(page.getByRole("heading", { name: "Review & confirm" })).toBeVisible();
    await expect(page.getByText(/Online payment isn't configured on this deployment yet/)).toBeVisible();
    await page.getByLabel("I have read the cancellation policy").check();
    await expect(page.getByRole("button", { name: /Pay .* securely/ })).toBeDisabled();
  });

  test("free trial lesson can be confirmed end to end", async ({ page }) => {
    await signIn(page, ACCOUNTS.student2);
    await page.goto("/teachers/sara-demo-3");
    await page.getByText("Free 30-minute trial lesson (Demo)").click();
    const slot = page.locator("button[aria-pressed]").last();
    await expect(slot).toBeVisible({ timeout: 20_000 });
    await slot.click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/checkout/);
    await page.getByLabel("I have read the cancellation policy").check();
    await page.getByRole("button", { name: "Confirm free lesson" }).click();
    await page.waitForURL(/\/lessons\/[0-9a-f-]+\?confirmed=1/);
    await expect(page.getByText("Your lesson is confirmed!")).toBeVisible();
    await expect(page.getByTestId("reschedule-card")).toBeVisible();
  });
});
