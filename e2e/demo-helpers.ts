import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

export const OUT = "demo-scenes";
mkdirSync(OUT, { recursive: true });
export const PAUSE = Number(process.env.DEMO_PAUSE_MS ?? 1600);

export async function caption(page: Page, text: string) {
  await page.evaluate((t) => {
    let el = document.getElementById("__demo_caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__demo_caption";
      Object.assign(el.style, { position: "fixed", left: "24px", bottom: "24px", zIndex: "99999", padding: "14px 20px", borderRadius: "12px",
        background: "rgba(11,127,117,.95)", color: "#fff", font: "600 22px system-ui, sans-serif", boxShadow: "0 8px 24px rgba(0,0,0,.25)", maxWidth: "70vw" });
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text).catch(() => {});
}

export async function show(page: Page, url: string, text: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle").catch(() => {});
  await caption(page, text);
  await page.waitForTimeout(PAUSE);
}

export async function step(page: Page, text: string, fn: () => Promise<unknown>) {
  await caption(page, text);
  try { await fn(); } catch (e) { console.warn(`[demo] optional step skipped: ${text}: ${(e as Error).message.split("\n")[0]}`); }
  await caption(page, text);
  await page.waitForTimeout(PAUSE);
}

export async function scroll(page: Page, px = 600) {
  await page.mouse.wheel(0, px);
  await page.waitForTimeout(PAUSE / 2);
}

