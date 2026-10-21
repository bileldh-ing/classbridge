/**
 * Versioned cancellation policies. The policy id is snapshotted onto each booking at creation,
 * so later policy edits never change the terms a student accepted.
 */
export type PolicyId = "flex-24h-v1" | "moderate-48h-v1";
export const POLICIES: Record<PolicyId, { id: PolicyId; summary: string }> = {
  "flex-24h-v1": { id: "flex-24h-v1", summary: "Full refund if the student cancels at least 24 hours before the start. No refund after that. Teacher cancellations are always fully refunded." },
  "moderate-48h-v1": { id: "moderate-48h-v1", summary: "Full refund at least 48 hours before the start, 50% between 48 and 24 hours, no refund within 24 hours. Teacher cancellations are always fully refunded." },
};

export function isPolicyId(v: string): v is PolicyId { return v in POLICIES; }

/** Returns the refundable amount in minor units. */
export function refundableAmount(opts: {
  policy: string; priceMinor: number; startsAt: Date; canceledAt: Date; canceledBy: "student" | "teacher" | "admin";
}): number {
  const { policy, priceMinor, startsAt, canceledAt, canceledBy } = opts;
  if (priceMinor === 0) return 0;
  if (canceledBy !== "student") return priceMinor;
  const hours = (startsAt.getTime() - canceledAt.getTime()) / 3_600_000;
  if (policy === "moderate-48h-v1") {
    if (hours >= 48) return priceMinor;
    if (hours >= 24) return Math.floor(priceMinor / 2);
    return 0;
  }
  // flex-24h-v1 (default)
  return hours >= 24 ? priceMinor : 0;
}
