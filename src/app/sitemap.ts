import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { courses, subjects, teacherProfiles } from "@/lib/db/schema";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().APP_URL;
  const db = getDb();
  const [ts, ss, cs] = await Promise.all([
    db.select({ slug: teacherProfiles.slug, u: teacherProfiles.updatedAt }).from(teacherProfiles).where(eq(teacherProfiles.publishState, "published")),
    db.select({ slug: subjects.slug }).from(subjects).where(eq(subjects.isActive, true)),
    db.select({ slug: courses.slug, u: courses.updatedAt }).from(courses).where(eq(courses.status, "published")),
  ]);
  const statics = ["", "/teachers", "/subjects", "/courses", "/how-it-works", "/become-a-teacher", "/pricing", "/help", "/legal/terms", "/legal/privacy", "/legal/cancellation"];
  return [
    ...statics.map((p) => ({ url: `${base}${p}` })),
    ...ts.map((t) => ({ url: `${base}/teachers/${t.slug}`, lastModified: t.u })),
    ...ss.map((s) => ({ url: `${base}/subjects/${s.slug}` })),
    ...cs.map((c) => ({ url: `${base}/courses/${c.slug}`, lastModified: c.u })),
  ];
}
