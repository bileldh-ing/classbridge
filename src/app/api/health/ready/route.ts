import { sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Readiness: DB reachable AND every committed migration applied. 503 otherwise (load balancers stop routing). */
export async function GET() {
  const checks: Record<string, string> = {};
  let ok = true;
  try {
    await getDb().execute(sql`SELECT 1`);
    checks.database = "ok";
  } catch { checks.database = "unreachable"; ok = false; }
  if (ok) {
    try {
      const journal = JSON.parse(await readFile(path.join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")) as { entries: unknown[] };
      const r = await getDb().execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
      const applied = Number(r.rows[0]?.n ?? 0);
      checks.migrations = applied >= journal.entries.length ? "ok" : `pending (${applied}/${journal.entries.length})`;
      if (applied < journal.entries.length) ok = false;
    } catch { checks.migrations = "unknown"; ok = false; }
  }
  return NextResponse.json({ status: ok ? "ready" : "not_ready", checks }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
