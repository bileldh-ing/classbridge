import { devices, expect, test } from "@playwright/test";

test("Arabic pages render right-to-left", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "cb_locale", value: "ar", url: baseURL ?? "http://localhost:3000" }]);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await page.goto("/teachers");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("ابحث عن معلم").first()).toBeVisible();
});

test.describe("mobile viewport", () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { defaultBrowserType, ...pixel } = devices["Pixel 7"];
  test.use(pixel);
  test("home and search fit the screen without horizontal scrolling; PWA manifest is linked", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.goto("/teachers");
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow2).toBeLessThanOrEqual(1);
    const manifest = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifest).toBeTruthy();
    const res = await page.request.get(manifest!);
    expect(res.ok()).toBe(true);
    expect((await res.json()).display).toBe("standalone");
  });
});
