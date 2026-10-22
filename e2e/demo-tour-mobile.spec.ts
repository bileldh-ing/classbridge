/** @demo — mobile scene (separate file: device emulation + video size must be set at file level). */
import { test } from "@playwright/test";
import { OUT, scroll, show } from "./demo-helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, video: { mode: "on", size: { width: 390, height: 844 } } });

test.afterEach(async ({ page }, testInfo) => {
  const video = page.video();
  const name = testInfo.title.split(" ")[0];
  await page.close();
  if (video) await video.saveAs(`${OUT}/${name}.webm`);
});

test("scene-17-mobile @demo", async ({ page }) => {
  await show(page, "/", "Mobile: responsive and installable (PWA + Capacitor apps)");
  await scroll(page);
  await show(page, "/teachers", "Search on a phone");
  await show(page, "/teachers/amira-demo-1", "Profile & booking on a phone");
  await scroll(page, 800);
});
