import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teacherCredentials, teacherProfiles } from "@/lib/db/schema";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { audit } from "@/lib/services/audit";

/** Private credential file: only the owning teacher or a verifier may download it; every staff access is audited. */
export const GET = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select({ c: teacherCredentials, ownerId: teacherProfiles.userId }).from(teacherCredentials).innerJoin(teacherProfiles, eq(teacherProfiles.id, teacherCredentials.teacherId)).where(eq(teacherCredentials.id, id));
  if (!row || !row.c.fileKey || (row.ownerId !== u.id && !can(u, "admin.verify_teachers"))) throw new AppError("NOT_FOUND", "File not found");
  const base = path.resolve(env().STORAGE_DIR);
  const full = path.resolve(base, row.c.fileKey);
  if (!full.startsWith(base + path.sep)) throw new AppError("NOT_FOUND", "File not found");
  const buf = await readFile(full).catch(() => { throw new AppError("NOT_FOUND", "File missing from storage"); });
  if (row.ownerId !== u.id) await audit(db, { actorId: u.id, action: "credential.file_viewed", targetType: "teacher_credential", targetId: id });
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": row.c.fileMime ?? "application/octet-stream", "Content-Disposition": `attachment; filename="credential-${id}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; sandbox" } });
});
