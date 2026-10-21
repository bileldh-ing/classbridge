import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { providerStatus } from "@/lib/env";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
/** Liveness + DB readiness + provider configuration state (no secrets). */
export async function GET() {
  try {
    await getDb().execute(sql`SELECT 1`);
    const p = providerStatus();
    return NextResponse.json({ status: "ok", db: "ok", providers: { payments: p.payments ?? "not_configured", classroom: p.classroom ?? "not_configured", geocoding: p.geocoding ?? "not_configured (city list fallback)", email: p.email ?? "not_configured" } });
  } catch {
    return NextResponse.json({ status: "degraded", db: "unreachable" }, { status: 503 });
  }
}
