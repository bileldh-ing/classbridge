import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getBookingDetail } from "@/lib/services/bookings";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  const d = await getBookingDetail(getDb(), u, (await params).id);
  const b = d.booking;
  return json({
    id: b.id, status: b.status, paymentStatus: b.paymentStatus, attendanceStatus: b.attendanceStatus, startsAt: b.startsAt.getTime(), endsAt: b.endsAt.getTime(),
    mode: b.mode, priceMinor: b.priceMinor, currency: b.currency, cancellationPolicy: b.cancellationPolicy, offering: d.offering.title,
    teacherName: d.teacherName, studentName: d.studentName, viewerRole: d.viewerRole,
    events: d.events.map((e) => ({ from: e.fromStatus, to: e.toStatus, actor: e.actorRole, reason: e.reason, at: e.createdAt.getTime() })),
  });
});
