import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { savedTeachers } from "@/lib/db/schema";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

const body = z.object({ teacherId: z.string().uuid() });
export const POST = route(async (req) => {
  const u = await requireUser();
  const { teacherId } = await parseBody(req, body);
  await getDb().insert(savedTeachers).values({ userId: u.id, teacherId }).onConflictDoNothing();
  return json({ ok: true });
});
export const DELETE = route(async (req) => {
  const u = await requireUser();
  const { teacherId } = await parseBody(req, body);
  await getDb().delete(savedTeachers).where(and(eq(savedTeachers.userId, u.id), eq(savedTeachers.teacherId, teacherId)));
  return json({ ok: true });
});
