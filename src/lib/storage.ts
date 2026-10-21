/** Private file storage helpers (local disk adapter; swap for S3/Supabase Storage with signed URLs in production). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Detects allowed types from magic bytes — never trusts the filename or client-declared MIME type. */
export function sniffFile(buf: Buffer): { ext: "pdf" | "png" | "jpg"; mime: string } | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return { ext: "pdf", mime: "application/pdf" };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  return null;
}
