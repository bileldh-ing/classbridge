import { expect, test } from "@playwright/test";
import { ACCOUNTS, originHeaders, signIn } from "./helpers";

test("classroom token is denied to a user who is not a participant", async ({ browser, baseURL }) => {
  // The demo student (Lina) has an upcoming confirmed lesson; find its id.
  const owner = await browser.newContext();
  const p1 = await owner.newPage();
  await signIn(p1, ACCOUNTS.student);
  await p1.goto("/lessons");
  const href = await p1.locator('a[href^="/lessons/"]').first().getAttribute("href");
  expect(href).toMatch(/^\/lessons\/[0-9a-f-]{36}$/);
  const id = href!.split("/")[2];
  await owner.close();

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await signIn(p2, ACCOUNTS.student2);
  const res = await p2.request.post(`/api/classrooms/${id}/token`, { headers: originHeaders(baseURL), data: {} });
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe("NOT_FOUND");
  const page = await p2.goto(`/lessons/${id}/classroom`);
  expect(page?.status()).toBe(404);
  await other.close();
});
