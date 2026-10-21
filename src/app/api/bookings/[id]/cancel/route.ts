import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { cancelBooking, cancelSchema } from "@/lib/services/bookings";
import { getPaymentProvider } from "@/lib/payments/stripe";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  const { reason } = await parseBody(req, cancelSchema);
  return json(await cancelBooking(getDb(), u, (await params).id, reason, getPaymentProvider()));
});
