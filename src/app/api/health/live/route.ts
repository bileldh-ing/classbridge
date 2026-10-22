import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
/** Liveness: the process is up and serving. No dependencies are checked (use /api/health/ready for that). */
export function GET() {
  return NextResponse.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) }, { headers: { "Cache-Control": "no-store" } });
}
