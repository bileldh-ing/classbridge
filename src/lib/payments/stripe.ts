/** Stripe implementation (Checkout Sessions + Refunds + signed webhooks). Server-only. */
import Stripe from "stripe";
import { AppError } from "../errors";
import type { CheckoutRequest, NormalizedPaymentEvent, PaymentProvider } from "./provider";
import { env } from "../env";

export class StripePaymentProvider implements PaymentProvider {
  name = "stripe";
  private stripe: Stripe;
  constructor(secretKey: string, private webhookSecret: string, client?: Stripe) {
    this.stripe = client ?? new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 });
  }

  async createCheckout(req: CheckoutRequest) {
    const expiresAt = new Date(Date.now() + 31 * 60_000); // Stripe minimum session lifetime is 30 minutes
    const s = await this.stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: req.customerEmail,
      client_reference_id: req.orderId,
      line_items: [{ quantity: 1, price_data: { currency: req.currency.toLowerCase(), unit_amount: req.amountMinor, product_data: { name: req.description } } }],
      metadata: { order_id: req.orderId, payment_intent_id: req.paymentIntentId },
      payment_intent_data: { metadata: { order_id: req.orderId } },
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    }, { idempotencyKey: `checkout:${req.paymentIntentId}` });
    if (!s.url) throw new Error("Stripe did not return a checkout URL");
    return { providerRef: s.id, url: s.url, expiresAt };
  }

  verifyWebhook(rawBody: string, signatureHeader: string | null) {
    if (!signatureHeader) throw new AppError("BAD_SIGNATURE", "Missing Stripe-Signature header");
    try {
      const ev = this.stripe.webhooks.constructEvent(rawBody, signatureHeader, this.webhookSecret, 300);
      return { id: ev.id, type: ev.type, payload: ev };
    } catch {
      throw new AppError("BAD_SIGNATURE", "Invalid webhook signature");
    }
  }

  normalize(e: { id: string; type: string; payload: unknown }): NormalizedPaymentEvent {
    const ev = e.payload as Stripe.Event;
    const obj = ev.data.object as unknown as Record<string, unknown>;
    const ref = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "id" in v ? String((v as { id: string }).id) : null);
    switch (ev.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = obj as unknown as Stripe.Checkout.Session;
        if (s.payment_status !== "paid") return { kind: "ignored", eventId: e.id, type: `${ev.type}:${s.payment_status}` };
        return { kind: "checkout.completed", eventId: e.id, checkoutRef: s.id, paymentRef: ref(s.payment_intent), amountMinor: s.amount_total ?? -1, currency: (s.currency ?? "").toUpperCase() };
      }
      case "checkout.session.async_payment_failed":
        return { kind: "payment.failed", eventId: e.id, checkoutRef: String(obj.id), paymentRef: ref(obj.payment_intent) };
      case "checkout.session.expired":
        return { kind: "checkout.expired", eventId: e.id, checkoutRef: String(obj.id) };
      case "refund.created":
      case "refund.updated":
      case "refund.failed": {
        const r = obj as unknown as Stripe.Refund;
        if (r.status === "succeeded") return { kind: "refund.succeeded", eventId: e.id, refundRef: r.id, amountMinor: r.amount };
        if (r.status === "failed" || r.status === "canceled") return { kind: "refund.failed", eventId: e.id, refundRef: r.id, message: r.failure_reason ?? r.status ?? undefined };
        return { kind: "ignored", eventId: e.id, type: `${ev.type}:${r.status}` };
      }
      case "charge.dispute.created":
        return { kind: "dispute.created", eventId: e.id, paymentRef: ref(obj.payment_intent) ?? "" };
      default:
        return { kind: "ignored", eventId: e.id, type: ev.type };
    }
  }

  async createRefund(req: { paymentRef: string | null; checkoutRef: string | null; amountMinor: number; idempotencyKey: string; refundId: string }) {
    let pi = req.paymentRef;
    if (!pi && req.checkoutRef) {
      const s = await this.stripe.checkout.sessions.retrieve(req.checkoutRef);
      pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
    }
    if (!pi) throw new Error("No Stripe PaymentIntent reference for this payment");
    const r = await this.stripe.refunds.create({ payment_intent: pi, amount: req.amountMinor, metadata: { refund_id: req.refundId } }, { idempotencyKey: req.idempotencyKey });
    return { providerRef: r.id };
  }
}

export function getPaymentProvider(): PaymentProvider | null {
  const e = env();
  if (e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET) return new StripePaymentProvider(e.STRIPE_SECRET_KEY, e.STRIPE_WEBHOOK_SECRET);
  return null;
}

export function getProviderByName(name: string): PaymentProvider | null {
  if (name === "stripe") return getPaymentProvider();
  return null;
}
