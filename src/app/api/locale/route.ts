import { cookies } from "next/headers";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { json, parseBody, route } from "@/lib/api";
import { LOCALE_COOKIE } from "@/lib/i18n/server";
import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

export const POST = route(async (req) => {
  const { locale } = await parseBody(req, z.object({ locale: z.enum(["en", "fr", "ar"]) }));
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 365 * 86400 });
  const u = await currentUser();
  if (u) await getDb().update(profiles).set({ locale, updatedAt: new Date() }).where(eq(profiles.userId, u.id));
  return json({ ok: true });
});
