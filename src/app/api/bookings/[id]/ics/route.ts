import { getDb } from "@/lib/db";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getBookingDetail } from "@/lib/services/bookings";
import { buildIcs } from "@/lib/time";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/** Downloadable calendar invite for participants of a confirmed lesson. */
export const GET = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  const d = await getBookingDetail(getDb(), u, (await params).id);
  if (!["confirmed", "in_progress", "completed"].includes(d.booking.status)) throw new AppError("NOT_ELIGIBLE", "Only confirmed lessons have calendar files.");
  const path = d.viewerRole === "teacher" ? `/teach/bookings/${d.booking.id}` : `/lessons/${d.booking.id}`;
  const body = buildIcs({ uid: d.booking.id, start: d.booking.startsAt, end: d.booking.endsAt, title: `ClassBridge: ${d.offering.title}`,
    description: `Lesson between ${d.studentName} and ${d.teacherName}. Join from ${env().APP_URL}${path}`, url: `${env().APP_URL}${path}` });
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="classbridge-lesson.ics"`, "Cache-Control": "no-store" } });
});
