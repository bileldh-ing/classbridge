/**
 * @demo — narrated product tour. NOT part of normal CI (excluded by playwright.config.ts); run with
 * `pnpm test:demo` (playwright.demo.config.ts: 1920x1080, slowMo, video on) against a freshly SEEDED app.
 * One test per scene so each produces its own video, saved as demo-scenes/scene-XX-<name>.webm.
 * Steps are tolerant (a missing optional element never aborts the recording) but each scene still asserts its
 * key screen with expect.soft so regressions show up in the report.
 */
import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn, signInStaff, uniqueEmail } from "./helpers";
import { caption, OUT, PAUSE, scroll, show, step } from "./demo-helpers";

test.afterEach(async ({ page }, testInfo) => {
  const video = page.video();
  const name = testInfo.title.split(" ")[0];
  await page.close();
  if (video) await video.saveAs(`${OUT}/${name}.webm`);
});

test("scene-01-home @demo", async ({ page }) => {
  await show(page, "/", "ClassBridge — learn with verified teachers, live online or near you");
  await expect.soft(page.locator("h1")).toBeVisible();
  await scroll(page); await scroll(page);
  await caption(page, "Subjects, how it works, and transparent pricing");
  await page.waitForTimeout(PAUSE);
});

test("scene-02-search-filters @demo", async ({ page }) => {
  await show(page, "/teachers", "Search teachers with server-side filters");
  await step(page, "Filter: subject, language, format", async () => {
    await page.locator("#subject").selectOption("french");
    await page.locator("#language").selectOption("fr");
    await page.locator("main form").getByRole("button").last().click();
    await page.waitForLoadState("networkidle");
  });
  await expect.soft(page.getByText("Lucas M. (Demo)").first()).toBeVisible();
  await scroll(page, 400);
});

test("scene-03-map-view @demo", async ({ page }) => {
  await show(page, "/teachers?view=map", "Map view — only approximate, privacy-safe teacher locations");
  await expect.soft(page.getByRole("tab", { name: /map/i })).toHaveAttribute("aria-selected", "true");
  await page.waitForTimeout(PAUSE * 2);
});

test("scene-04-teacher-profile @demo", async ({ page }) => {
  await show(page, "/teachers/amira-demo-1", "Teacher profile: badges, credentials, offerings, reviews");
  await expect.soft(page.getByRole("heading", { level: 1 })).toContainText("Amira");
  await scroll(page); await scroll(page);
});

test("scene-05-slot-pick @demo", async ({ page }) => {
  await show(page, "/teachers/sara-demo-3", "Real availability in your own time zone");
  await step(page, "Pick a lesson type and a free slot", async () => {
    await page.getByText("Free 30-minute trial lesson (Demo)").click();
    await page.locator("button[aria-pressed]").first().click();
  });
  await expect.soft(page.getByRole("link", { name: "Sign in to book" })).toBeVisible();
});

test("scene-06-signup @demo", async ({ page }) => {
  await show(page, "/signup", "Create a free account (18+, explicit consent)");
  await step(page, "Fill in the sign-up form", async () => {
    await page.getByLabel("Full name").fill("Demo Visitor");
    await page.getByLabel("Email").fill(uniqueEmail("demo"));
    await page.getByLabel("Password", { exact: true }).fill("CorrectHorse42!");
    for (const box of await page.locator("main form input[type=checkbox]").all()) {
      const label = (await box.locator("xpath=..").innerText()).toLowerCase();
      if (!label.includes("news")) await box.check();
    }
  });
  await step(page, "Join — straight to the dashboard", async () => {
    await page.locator("main form").getByRole("button", { name: "Join free" }).click();
    await page.waitForURL(/\/dashboard/);
  });
  await expect.soft(page).toHaveURL(/\/dashboard/);
});

test("scene-07-booking @demo", async ({ page }) => {
  await signIn(page, ACCOUNTS.student2);
  await show(page, "/teachers/sara-demo-3", "Book a free trial lesson");
  await step(page, "Choose the trial and a time", async () => {
    await page.getByText("Free 30-minute trial lesson (Demo)").click();
    await page.locator("button[aria-pressed]").nth(2).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/checkout/);
  });
  await step(page, "The slot is held for you; confirm the free lesson", async () => {
    await page.getByLabel("I have read the cancellation policy").check();
    await page.getByRole("button", { name: "Confirm free lesson" }).click();
    await page.waitForURL(/confirmed=1/);
  });
  await expect.soft(page.getByText("Your lesson is confirmed!")).toBeVisible();
  await scroll(page, 500);
  await caption(page, "Reschedule, calendar file and support are one click away");
  await page.waitForTimeout(PAUSE);
});

test("scene-08-checkout-state @demo", async ({ page }) => {
  await signIn(page, ACCOUNTS.student2);
  await show(page, "/teachers/lucas-demo-2", "Paid lessons go through a payment-provider adapter");
  await step(page, "Pick a paid lesson", async () => {
    await page.getByText("60-minute private lesson (Demo)").click();
    await page.locator("button[aria-pressed]").last().click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/checkout/);
  });
  await caption(page, "Honest state: payments not configured on this deployment — nothing is charged");
  await expect.soft(page.getByText(/Online payment isn't configured/)).toBeVisible();
  await page.waitForTimeout(PAUSE * 2);
});

test("scene-09-lessons @demo", async ({ page }) => {
  await signIn(page, ACCOUNTS.student);
  await show(page, "/lessons", "My lessons: upcoming and past, with status history");
  await step(page, "Open the upcoming lesson", async () => { await page.locator('a[href^="/lessons/"]').first().click(); await page.waitForLoadState("networkidle"); });
  await scroll(page, 500);
});

test("scene-10-classroom @demo", async ({ page }) => {
  await signIn(page, ACCOUNTS.student);
  await page.goto("/lessons");
  const href = await page.locator('a[href^="/lessons/"]').first().getAttribute("href");
  await show(page, `${href}/classroom`, "Private classroom: short-lived tokens, only for participants, only in the join window");
  await page.waitForTimeout(PAUSE * 2);
});

test("scene-11-teacher-tools @demo", async ({ page }) => {
  await signIn(page, ACCOUNTS.sara);
  await show(page, "/teach", "Teacher dashboard (same account, teacher capability)");
  await show(page, "/teach/profile", "Public profile & onboarding checklist");
  await scroll(page);
  await show(page, "/teach/availability", "Weekly availability, exceptions, buffers and notice");
  await show(page, "/teach/offerings", "Offerings: trial, 1:1 and group lessons");
  await show(page, "/teach/group-sessions", "Group sessions with capacity");
  await show(page, "/teach/courses", "Course builder");
  await step(page, "Open the course: sections, lessons, quiz questions", async () => { await page.locator('a[href^="/teach/courses/"]').first().click(); await page.waitForLoadState("networkidle"); });
  await scroll(page);
});

test("scene-12-course-player @demo", async ({ page }) => {
  await signIn(page, ACCOUNTS.student);
  await show(page, "/my-courses", "Self-paced courses: progress, notes, bookmarks, assignments");
  await step(page, "Open the course", async () => { await page.getByRole("link", { name: /Python basics/ }).first().click(); await page.waitForLoadState("networkidle"); });
  await step(page, "Start learning", async () => { await page.locator('a[href^="/learn/"]').first().click(); await page.waitForURL(/\/learn\//); });
  for (let i = 0; i < 3; i++) {
    await step(page, "Complete the lesson, take a private note", async () => {
      const done = page.getByRole("button", { name: /complete/i }).first();
      if (await done.isVisible()) await done.click();
      if (i === 0) {
        await page.getByLabel("My notes (private)").fill("Variables hold values; use type() to inspect.");
        await page.getByRole("button", { name: "Save note" }).click();
        await page.getByRole("button", { name: /Bookmark/ }).click();
      }
    });
    await step(page, "Next lesson", async () => { await page.locator('a[href^="/learn/"]').filter({ hasText: "→" }).first().click(); await page.waitForLoadState("networkidle"); });
  }
  await step(page, "Final quiz — answers are graded server-side", async () => {
    for (const label of ["'3'", "0, 1, 2", "def"]) await page.getByLabel(label, { exact: true }).check().catch(() => page.getByText(label, { exact: true }).click());
    await page.getByRole("button", { name: /submit/i }).click();
  });
  await scroll(page, 400);
  await caption(page, "Pass + all lessons complete → verifiable certificate");
  await page.waitForTimeout(PAUSE * 2);
  await step(page, "Assignments with manual grading", async () => { await page.getByRole("link", { name: "Assignments & announcements" }).click(); await page.waitForLoadState("networkidle"); });
});

test("scene-13-messages-notifications @demo", async ({ page }) => {
  await signIn(page, ACCOUNTS.student);
  await page.goto("/lessons");
  await page.locator('a[href^="/lessons/"]').first().click();
  await caption(page, "Messaging opens from a shared booking (anti-spam rule)");
  await page.waitForTimeout(PAUSE);
  await step(page, "Open the conversation", async () => { await page.getByRole("button", { name: /message/i }).first().click(); await page.waitForURL(/\/messages\//); });
  await step(page, "Realtime thread (server-sent events) — send a message", async () => {
    await page.locator("#msg").fill("Hello! Looking forward to our lesson (demo).");
    await page.getByRole("button", { name: /send/i }).click();
  });
  await step(page, "Attach a file (PDF/PNG/JPEG/WebP, ≤5 MB, private storage)", async () => {
    await page.setInputFiles("#attach", { name: "notes.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex") });
  });
  await show(page, "/notifications", "Notification centre");
});

test("scene-14-reviews @demo", async ({ page }) => {
  await show(page, "/teachers/lucas-demo-2", "Reviews: only after a completed, attended lesson — one per booking");
  await step(page, "Scroll to reviews", async () => { await page.getByRole("heading", { name: "Reviews" }).scrollIntoViewIfNeeded(); });
  await page.waitForTimeout(PAUSE);
});

test("scene-15-admin @demo", async ({ page }) => {
  await signInStaff(page, ACCOUNTS.admin);
  await show(page, "/admin", "Admin (TOTP two-factor required): platform metrics");
  await show(page, "/admin/teachers", "Teacher verification — every decision needs a reason");
  await step(page, "Approve the pending teacher", async () => {
    const card = page.locator("section").filter({ hasText: "Profiles awaiting review" }).locator("div.mb-3").first();
    await card.getByPlaceholder(/Reason/).fill("Profile complete and credentials checked (demo)");
    await card.getByRole("button", { name: "Approve & publish" }).click();
  });
  await show(page, "/admin/audit", "Append-only audit log");
  await show(page, "/admin/support", "Support queue (safety first, then oldest)");
  await step(page, "Open a ticket: internal notes are staff-only", async () => { await page.locator('a[href^="/admin/support/"]').first().click(); await page.waitForLoadState("networkidle"); });
  await show(page, "/admin/flags", "Feature flags (audited): group lessons, guardian access, minors OFF");
  await show(page, "/admin/moderation", "Content moderation: unpublish courses, suspend profiles");
  await show(page, "/admin/subjects", "Subjects & categories (EN / FR / AR)");
});

test("scene-16-arabic-rtl @demo", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "cb_locale", value: "ar", url: baseURL ?? "http://localhost:3000" }]);
  await show(page, "/", "العربية — full right-to-left layout");
  await expect.soft(page.locator("html")).toHaveAttribute("dir", "rtl");
  await show(page, "/teachers", "Search in Arabic");
  await show(page, "/teachers/nadia-demo-7", "Teacher profile (RTL)");
});
