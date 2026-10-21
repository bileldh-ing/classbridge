import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { confirmFreeBooking } from "@/lib/services/bookings";
import { deliverPendingEmails } from "@/lib/email/outbox";

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  const { id } = await params;
  const r = await confirmFreeBooking(getDb(), u, id);
  void deliverPendingEmails(getDb()).catch(() => {});
  return json({ ...r, redirect: `/lessons/${id}?confirmed=1` });
});
