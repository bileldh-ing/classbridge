/** Admin taxonomy (subjects/categories) and content moderation (courses, teacher profiles). All changes audited. */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB, DbOrTx } from "../db";
import { courses, subjectCategories, subjects, teacherProfiles } from "../db/schema";
import { AppError, pgCode, PG_UNIQUE_VIOLATION } from "../errors";
import { can, type Permission, type Principal } from "../auth/permissions";
import { audit } from "./audit";
import { notify } from "./notify";

function need(actor: Principal, perm: Permission) {
  if (!can(actor, perm)) throw new AppError("FORBIDDEN", "You do not have permission to do this.");
}
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug_format").min(2).max(60);
const names = { nameEn: z.string().trim().min(2).max(80), nameFr: z.string().trim().min(2).max(80), nameAr: z.string().trim().min(2).max(80) };

export const categorySchema = z.object({ slug, ...names, sortOrder: z.coerce.number().int().min(0).max(1000).default(0), isActive: z.boolean().default(true) });
export const subjectSchema = z.object({ slug, ...names, categoryId: z.string().uuid(), isActive: z.boolean().default(true) });

async function unique<T>(fn: () => Promise<T>) {
  try { return await fn(); } catch (e) { if (pgCode(e) === PG_UNIQUE_VIOLATION) throw new AppError("CONFLICT", "That slug is already used."); throw e; }
}

export async function listTaxonomy(db: DbOrTx) {
  const [cats, subs] = await Promise.all([
    db.select().from(subjectCategories).orderBy(asc(subjectCategories.sortOrder), asc(subjectCategories.nameEn)),
    db.select().from(subjects).orderBy(asc(subjects.nameEn)),
  ]);
  return cats.map((c) => ({ ...c, subjects: subs.filter((s) => s.categoryId === c.id) }));
}

export async function upsertCategory(db: DB, actor: Principal, input: z.infer<typeof categorySchema>, id?: string) {
  need(actor, "admin.manage_subjects");
  return unique(() => db.transaction(async (tx) => {
    const [c] = id
      ? await tx.update(subjectCategories).set(input).where(eq(subjectCategories.id, id)).returning()
      : await tx.insert(subjectCategories).values(input).returning();
    if (!c) throw new AppError("NOT_FOUND", "Category not found.");
    await audit(tx, { actorId: actor.id, action: id ? "taxonomy.category_updated" : "taxonomy.category_created", targetType: "subject_category", targetId: c.id, metadata: { slug: c.slug, isActive: c.isActive } });
    return c;
  }));
}

export async function upsertSubject(db: DB, actor: Principal, input: z.infer<typeof subjectSchema>, id?: string) {
  need(actor, "admin.manage_subjects");
  return unique(() => db.transaction(async (tx) => {
    const [cat] = await tx.select({ id: subjectCategories.id }).from(subjectCategories).where(eq(subjectCategories.id, input.categoryId));
    if (!cat) throw new AppError("VALIDATION_FAILED", "Unknown category.");
    const [s] = id ? await tx.update(subjects).set(input).where(eq(subjects.id, id)).returning() : await tx.insert(subjects).values(input).returning();
    if (!s) throw new AppError("NOT_FOUND", "Subject not found.");
    await audit(tx, { actorId: actor.id, action: id ? "taxonomy.subject_updated" : "taxonomy.subject_created", targetType: "subject", targetId: s.id, metadata: { slug: s.slug, isActive: s.isActive } });
    return s;
  }));
}

const reason = z.string().trim().min(5).max(1000);
export const courseModerationSchema = z.object({ action: z.enum(["unpublish", "restore"]), reason });
export const teacherModerationSchema = z.object({ action: z.enum(["suspend", "reinstate"]), reason });

/** Unpublish (archive) a course for policy reasons, or restore it to draft so the teacher can fix and republish. */
export async function moderateCourse(db: DB, actor: Principal, courseId: string, input: z.infer<typeof courseModerationSchema>) {
  need(actor, "admin.moderate_content");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(courses).where(eq(courses.id, courseId)).for("update");
    if (!c) throw new AppError("NOT_FOUND", "Course not found.");
    const status = input.action === "unpublish" ? "archived" : "draft";
    if (input.action === "unpublish" && c.status !== "published") throw new AppError("INVALID_TRANSITION", `Course is ${c.status}.`);
    await tx.update(courses).set({ status, moderationNote: input.reason, moderatedAt: new Date(), updatedAt: new Date() }).where(eq(courses.id, c.id));
    await audit(tx, { actorId: actor.id, action: `course.${input.action === "unpublish" ? "unpublished_by_moderator" : "restored_by_moderator"}`, targetType: "course", targetId: c.id, reason: input.reason });
    const [t] = await tx.select({ userId: teacherProfiles.userId }).from(teacherProfiles).where(eq(teacherProfiles.id, c.teacherId));
    await notify(tx, { userId: t.userId, kind: "course_moderated", title: input.action === "unpublish" ? `Course "${c.title}" was unpublished` : `Course "${c.title}" was restored to draft`, body: input.reason, link: `/teach/courses/${c.id}`, dedupeKey: `course_moderated:${c.id}:${Date.now()}` });
    return { status };
  });
}

export async function moderateTeacher(db: DB, actor: Principal, teacherId: string, input: z.infer<typeof teacherModerationSchema>) {
  need(actor, "admin.moderate_content");
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(teacherProfiles).where(eq(teacherProfiles.id, teacherId)).for("update");
    if (!t) throw new AppError("NOT_FOUND", "Teacher not found.");
    if (input.action === "suspend" && t.publishState !== "published") throw new AppError("INVALID_TRANSITION", `Profile is ${t.publishState}.`);
    if (input.action === "reinstate" && t.publishState !== "suspended") throw new AppError("INVALID_TRANSITION", `Profile is ${t.publishState}.`);
    const publishState = input.action === "suspend" ? "suspended" : "published";
    await tx.update(teacherProfiles).set({ publishState, reviewNote: input.reason, updatedAt: new Date() }).where(eq(teacherProfiles.id, t.id));
    await audit(tx, { actorId: actor.id, action: `teacher.profile_${input.action === "suspend" ? "suspended" : "reinstated"}`, targetType: "teacher_profile", targetId: t.id, reason: input.reason });
    await notify(tx, { userId: t.userId, kind: "teacher_moderated", title: input.action === "suspend" ? "Your public profile was suspended" : "Your public profile was reinstated", body: input.reason, link: "/teach", dedupeKey: `teacher_moderated:${t.id}:${Date.now()}` });
    return { publishState };
  });
}
