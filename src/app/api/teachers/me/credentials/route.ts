import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { teacherCredentials } from "@/lib/db/schema";
import { json, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { requireTeacher } from "@/lib/services/teachers";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/services/rate-limit";
import { sniffFile, MAX_UPLOAD_BYTES } from "@/lib/storage";

const meta = z.object({ title: z.string().trim().min(2).max(160), issuer: z.string().trim().min(2).max(160), issuedYear: z.coerce.number().int().min(1950).max(2100).optional() });

/**
 * Credential upload to PRIVATE storage (outside /public). Type verified from magic bytes (PDF/PNG/JPEG),
 * max 5 MB. Creates a verification-review record; no badge is granted until an admin approves it.
 */
export const POST = route(async (req) => {
  const u = await requirePermission("teach.manage_profile");
  const db = getDb();
  await enforceRateLimit(db, `cred-upload:${u.id}`, 10, 3600);
  const t = await requireTeacher(db, u.id);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64_000) throw new AppError("VALIDATION_FAILED", "File too large (max 5 MB).");
  const form = await req.formData();
  const m = meta.parse({ title: form.get("title"), issuer: form.get("issuer"), issuedYear: form.get("issuedYear") || undefined });
  const file = form.get("file");
  let fileKey: string | null = null, mime: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError("VALIDATION_FAILED", "File too large (max 5 MB).");
    const buf = Buffer.from(await file.arrayBuffer());
    const kind = sniffFile(buf);
    if (!kind) throw new AppError("VALIDATION_FAILED", "Only PDF, PNG or JPEG files are accepted.");
    fileKey = `credentials/${t.id}/${randomUUID()}.${kind.ext}`;
    mime = kind.mime;
    const full = path.resolve(env().STORAGE_DIR, fileKey);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buf, { mode: 0o600 });
  }
  const [c] = await db.insert(teacherCredentials).values({ teacherId: t.id, ...m, fileKey, fileMime: mime }).returning({ id: teacherCredentials.id });
  return json({ id: c.id }, 201);
});
