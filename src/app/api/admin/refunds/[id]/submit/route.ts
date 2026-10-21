import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { submitRefund } from "@/lib/services/bookings";
import { getPaymentProvider } from "@/lib/payments/stripe";
import { audit } from "@/lib/services/audit";
/** Send / retry a refund with the provider. Final status still comes from the verified webhook. */
export const POST = route<{ id: string }>(async (_req, { params }) => {
  const u = await requirePermission("admin.manage_refunds");
  const { id } = await params;
  const r = await submitRefund(getDb(), id, getPaymentProvider());
  await audit(getDb(), { actorId: u.id, action: "refund.submitted", targetType: "refund", targetId: id, metadata: { resultStatus: r.status } });
  return json({ status: r.status });
});
