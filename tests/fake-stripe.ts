/**
 * Test double: real StripePaymentProvider signature verification + normalisation (local crypto, no network),
 * with createCheckout/createRefund stubbed. Mocks are used ONLY in automated tests.
 */
import Stripe from "stripe";
import { StripePaymentProvider } from "@/lib/payments/stripe";

export const TEST_WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests_only";
const stripe = new Stripe("sk_test_dummy_not_used_for_network");

export class FakeStripe extends StripePaymentProvider {
  sessions = 0;
  refundsCreated: Array<{ amountMinor: number; idempotencyKey: string }> = [];
  failRefund = false;
  constructor() { super("sk_test_dummy_not_used_for_network", TEST_WEBHOOK_SECRET, stripe); }
  override async createCheckout() {
    this.sessions++;
    return { providerRef: `cs_test_${this.sessions}_${Date.now()}`, url: "https://checkout.stripe.com/c/pay/test", expiresAt: new Date(Date.now() + 31 * 60_000) };
  }
  override async createRefund(req: { amountMinor: number; idempotencyKey: string }) {
    if (this.failRefund) throw new Error("card_declined_for_refund (simulated provider error)");
    this.refundsCreated.push(req);
    return { providerRef: `re_test_${this.refundsCreated.length}` };
  }
}

export function signedEvent(event: object) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: TEST_WEBHOOK_SECRET });
  return { payload, header };
}

export function checkoutCompleted(id: string, sessionId: string, amount: number, currency = "eur", paymentStatus = "paid") {
  return { id, object: "event", type: "checkout.session.completed", api_version: "2025-01-01", created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 1, request: null,
    data: { object: { id: sessionId, object: "checkout.session", payment_status: paymentStatus, amount_total: amount, currency, payment_intent: `pi_${sessionId}` } } };
}
export function simpleEvent(id: string, type: string, object: object) {
  return { id, object: "event", type, api_version: "2025-01-01", created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 1, request: null, data: { object } };
}
