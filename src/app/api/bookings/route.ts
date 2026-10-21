import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission, requireUser } from "@/lib/auth/session";
import { createBooking, createBookingSchema, listStudentBookings } from "@/lib/services/bookings";

/** Create a slot hold (status slot_held). Requires the student capability. */
export const POST = route(async (req) => {
  const u = await requirePermission("learn.book");
  const b = await createBooking(getDb(), u, await parseBody(req, createBookingSchema));
  return json({ id: b.id, status: b.status, holdExpiresAt: b.holdExpiresAt?.getTime() ?? null }, 201);
});

/** The current user's bookings as a student. */
export const GET = route(async () => {
  const u = await requireUser();
  const rows = await listStudentBookings(getDb(), u.id);
  return json({ items: rows.map((r) => ({ id: r.b.id, status: r.b.status, startsAt: r.b.startsAt.getTime(), endsAt: r.b.endsAt.getTime(), title: r.title, teacherName: r.teacherName })) });
});
