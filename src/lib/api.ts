/** Route-handler helpers: consistent error envelope, CSRF origin check, Zod body parsing. */
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, isAppError } from "./errors";
import { log } from "./log";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(e: unknown) {
  if (isAppError(e)) return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  if (e instanceof ZodError) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Invalid input", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }, { status: 422 });
  }
  log.error("unhandled_route_error", { err: e instanceof Error ? e.message : String(e) });
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong." } }, { status: 500 });
}

type Ctx<P> = { params: Promise<P> };

export function route<P = Record<string, string>>(fn: (req: Request, ctx: Ctx<P>) => Promise<Response>, opts: { csrf?: boolean } = {}) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      if (opts.csrf !== false && !["GET", "HEAD", "OPTIONS"].includes(req.method)) assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Cookie-authenticated mutations must come from our own origin (defence in depth on top of SameSite=Lax). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin) {
    const site = req.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") throw new AppError("FORBIDDEN", "Cross-site request rejected.");
    return;
  }
  try {
    if (new URL(origin).host !== host) throw new AppError("FORBIDDEN", "Cross-site request rejected.");
  } catch (e) {
    if (isAppError(e)) throw e;
    throw new AppError("FORBIDDEN", "Invalid origin.");
  }
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw new AppError("VALIDATION_FAILED", "Expected application/json");
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 64_000) throw new AppError("VALIDATION_FAILED", "Body too large");
  let data: unknown;
  try { data = await req.json(); } catch { throw new AppError("VALIDATION_FAILED", "Malformed JSON"); }
  return schema.parse(data);
}

export function searchParamsObject(url: string) {
  return Object.fromEntries(new URL(url).searchParams.entries());
}
