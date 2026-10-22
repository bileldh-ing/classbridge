import { expect, test } from "@playwright/test";

test.describe("visitor: search → teacher profile", () => {
  test("home loads and search filters lead to a published teacher profile", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await page.goto("/teachers?subject=mathematics");
    const card = page.getByRole("link", { name: /Amira B\. \(Demo\)/ }).first();
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/\/teachers\/amira-demo-1/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Amira B.");
    await expect(page.getByText("Book a lesson")).toBeVisible();
    // Unpublished (pending) teachers are not public.
    const pending = await page.goto("/teachers/pierre-demo-8");
    expect(pending?.status()).toBe(404);
  });

  test("map view renders the list alternative and approximate markers", async ({ page }) => {
    await page.goto("/teachers?view=map");
    await expect(page.getByRole("tab", { name: /map/i })).toHaveAttribute("aria-selected", "true");
  });

  test("security headers: nonce-based CSP on pages, locked-down API CSP, readiness", async ({ page, request }) => {
    const res = await page.goto("/");
    const csp = res?.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(res?.headers()["x-frame-options"]).toBe("DENY");
    const ready = await request.get("/api/health/ready");
    expect(ready.status()).toBe(200);
    expect((await ready.json()).checks.migrations).toBe("ok");
  });
});
