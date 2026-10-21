import { describe, expect, it } from "vitest";
import { FakeStripe, checkoutCompleted, signedEvent, simpleEvent } from "../fake-stripe";

describe("Stripe webhook verification & normalisation", () => {
  const p = new FakeStripe();
  it("accepts a correctly signed payload", () => {
    const { payload, header } = signedEvent(checkoutCompleted("evt_1", "cs_1", 3000));
    const ev = p.verifyWebhook(payload, header);
    expect(ev.id).toBe("evt_1");
    expect(p.normalize(ev)).toMatchObject({ kind: "checkout.completed", checkoutRef: "cs_1", amountMinor: 3000, currency: "EUR", paymentRef: "pi_cs_1" });
  });
  it("rejects tampered payloads, wrong secrets and missing headers", () => {
    const { payload, header } = signedEvent(checkoutCompleted("evt_2", "cs_2", 3000));
    expect(() => p.verifyWebhook(payload.replace("3000", "1"), header)).toThrow(/Invalid webhook signature/);
    expect(() => p.verifyWebhook(payload, header.replace(/v1=[a-f0-9]+/, "v1=deadbeef"))).toThrow(/Invalid webhook signature/);
    expect(() => p.verifyWebhook(payload, null)).toThrow(/Missing/);
  });
  it("ignores unpaid (async pending) sessions and unknown types", () => {
    expect(p.normalize({ id: "e", type: "checkout.session.completed", payload: checkoutCompleted("e", "cs", 10, "eur", "unpaid") }).kind).toBe("ignored");
    expect(p.normalize({ id: "e2", type: "customer.created", payload: simpleEvent("e2", "customer.created", {}) }).kind).toBe("ignored");
  });
  it("maps refunds and expirations", () => {
    expect(p.normalize({ id: "r", type: "refund.updated", payload: simpleEvent("r", "refund.updated", { id: "re_1", status: "succeeded", amount: 500 }) }))
      .toEqual({ kind: "refund.succeeded", eventId: "r", refundRef: "re_1", amountMinor: 500 });
    expect(p.normalize({ id: "x", type: "checkout.session.expired", payload: simpleEvent("x", "checkout.session.expired", { id: "cs_9" }) }))
      .toEqual({ kind: "checkout.expired", eventId: "x", checkoutRef: "cs_9" });
  });
});
