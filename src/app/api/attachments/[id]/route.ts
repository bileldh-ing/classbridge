import { getDb } from "@/lib/db";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getAttachmentForMember } from "@/lib/services/messaging";
import { getPrivateFile } from "@/lib/storage";
import { AppError } from "@/lib/errors";

/** Membership-checked download from private storage; served as an attachment in a sandboxed, no-store response. */
export const GET = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  const a = await getAttachmentForMember(getDb(), u, (await params).id);
  const buf = await getPrivateFile(a.storageKey).catch(() => { throw new AppError("NOT_FOUND", "File missing from storage"); });
  return new Response(new Uint8Array(buf), { headers: {
    "Content-Type": a.mime, "Content-Disposition": `attachment; filename="${a.originalName.replace(/[^\w.\- ]/g, "_")}"`,
    "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
});
