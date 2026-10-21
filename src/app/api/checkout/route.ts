import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { startCheckout } from "@/lib/services/bookings";
import { getPaymentProvider } from "@/lib/payments/stripe";

/** Creates a provider checkout session for a held paid booking. Returns the hosted checkout URL. */
export const POST = route(async (req) => {
  const u = await requireUser();
  const { bookingId } = await parseBody(req, z.object({ bookingId: z.string().uuid() }));
  return json(await startCheckout(getDb(), u, bookingId, getPaymentProvider()));
});
