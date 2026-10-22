import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { sendAttachment } from "@/lib/services/messaging";
import { AppError } from "@/lib/errors";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";

/** Multipart upload: field `file` (+ optional `caption`). Type from magic bytes, ≤ 5 MB, private storage. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64_000) throw new AppError("VALIDATION_FAILED", "File too large (max 5 MB).");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("VALIDATION_FAILED", "Attach a file.");
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError("VALIDATION_FAILED", "File too large (max 5 MB).");
  const caption = typeof form.get("caption") === "string" ? String(form.get("caption")) : undefined;
  const r = await sendAttachment(getDb(), u, (await params).id, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, caption);
  return json({ id: r.message.id, createdAt: r.message.createdAt.getTime(), body: r.message.body, attachment: r.attachment }, 201);
});
