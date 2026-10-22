/**
 * Private file storage (local-disk adapter under STORAGE_DIR, never served statically).
 * Swap for S3/R2/Supabase Storage with short-lived signed URLs in production; callers only use these helpers.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type SniffedType = { ext: "pdf" | "png" | "jpg" | "webp" | "gif"; mime: string };

/** Detects allowed types from magic bytes — never trusts the filename or client-declared MIME type. */
export function sniffFile(buf: Buffer, allowed: ReadonlyArray<SniffedType["ext"]> = ["pdf", "png", "jpg"]): SniffedType | null {
  let t: SniffedType | null = null;
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") t = { ext: "pdf", mime: "application/pdf" };
  else if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) t = { ext: "png", mime: "image/png" };
  else if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) t = { ext: "jpg", mime: "image/jpeg" };
  else if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") t = { ext: "webp", mime: "image/webp" };
  else if (buf.length >= 6 && ["GIF87a", "GIF89a"].includes(buf.subarray(0, 6).toString("latin1"))) t = { ext: "gif", mime: "image/gif" };
  return t && allowed.includes(t.ext) ? t : null;
}

/** Keeps a display name safe for Content-Disposition and UI (no paths, control chars or quotes). */
export function safeFileName(name: string, fallbackExt: string) {
  const base = path.basename(name || "file").replace(/[\u0000-\u001f\u007f"\\/<>:|?*]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  return base || `file.${fallbackExt}`;
}

function resolveKey(key: string) {
  const root = path.resolve(env().STORAGE_DIR);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("invalid storage key");
  return full;
}

export async function putPrivateFile(key: string, buf: Buffer) {
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf, { mode: 0o600 });
}

export async function getPrivateFile(key: string) {
  return readFile(resolveKey(key));
}
