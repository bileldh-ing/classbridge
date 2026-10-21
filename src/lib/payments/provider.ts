/**
 * Payment adapter interfaces (spec §2 Payments). Implementations translate provider events into
 * NormalizedPaymentEvent, which `processPaymentEvent` applies idempotently.
 */
export type CheckoutRequest = {
  orderId: string; paymentIntentId: string; amountMinor: number; currency: string; description: string;
  customerEmail: string; successUrl: string; cancelUrl: string;
};

export type NormalizedPaymentEvent =
  | { kind: "checkout.completed"; eventId: string; checkoutRef: string; paymentRef: string | null; amountMinor: number; currency: string }
  | { kind: "checkout.expired"; eventId: string; checkoutRef: string }
  | { kind: "payment.failed"; eventId: string; checkoutRef: string | null; paymentRef: string | null; message?: string }
  | { kind: "refund.succeeded"; eventId: string; refundRef: string; amountMinor: number }
  | { kind: "refund.failed"; eventId: string; refundRef: string; message?: string }
  | { kind: "dispute.created"; eventId: string; paymentRef: string }
  | { kind: "ignored"; eventId: string; type: string };

export interface PaymentProviderBase {
  name: string;
  createCheckout(req: CheckoutRequest): Promise<{ providerRef: string; url: string; expiresAt: Date }>;
  /** Verifies the signature over the RAW body and returns the provider event (throws on failure). */
  verifyWebhook(rawBody: string, signatureHeader: string | null): { id: string; type: string; payload: unknown };
  normalize(event: { id: string; type: string; payload: unknown }): NormalizedPaymentEvent;
}

export interface RefundProvider {
  createRefund(req: { paymentRef: string | null; checkoutRef: string | null; amountMinor: number; idempotencyKey: string; refundId: string }): Promise<{ providerRef: string }>;
}

export interface PayoutProvider {
  /** Payout rails require provider onboarding/KYC (e.g. Stripe Connect). Not enabled in this build. */
  isPayoutAvailable(teacherId: string): Promise<boolean>;
}

export type PaymentProvider = PaymentProviderBase & RefundProvider;
