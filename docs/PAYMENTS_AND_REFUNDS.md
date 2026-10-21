# Payments & refunds

## Status
- **Adapter implemented**: `src/lib/payments/stripe.ts` (Checkout Sessions, Refunds, webhook verification + normalisation).
- **Not configured in this environment** (no Stripe keys). The UI shows "Online payment isn't configured…" and `/api/checkout` returns `503 PAYMENT_PROVIDER_NOT_CONFIGURED`; nothing is charged and no booking is confirmed.
- **Free lessons/courses** (price 0) are confirmed/enrolled without a provider — a valid free-booking rule, labelled as free, never as a payment.
- Live Stripe integration has **not** been tested against Stripe's servers. Webhook verification/processing **is** tested with events signed locally by the official SDK (`stripe.webhooks.generateTestHeaderString`).

## Eligibility (21 Oct 2026)
Stripe's availability list does not include Tunisia. Options: (a) register the platform entity in a Stripe-supported country; (b) add a local licensed PSP adapter (e.g. Konnect/Flouci/Paymob — not researched in depth here) implementing `PaymentProvider`. **Payouts are disabled**: no "withdraw" button, ledger rows carry `payout_status = 'unavailable'`. ClassBridge never holds funds in a database balance (no escrow imitation).

## Flow
1. `POST /api/bookings` → `slot_held` (hold = `BOOKING_HOLD_MINUTES`, default 10).
2. `POST /api/checkout` → order + order_item (amount/currency snapshot) + payment_intent → Stripe Checkout Session (idempotency key `checkout:<payment_intent_id>`, expires in 31 min) → booking `awaiting_payment`, hold extended to the session expiry.
3. Stripe → `POST /api/payments/webhook/stripe`:
   - signature verified on the raw body; event stored once (`provider_webhook_events` unique `(provider,event_id)`); processed/ignored events are not re-applied; failed processing rolls back and is retried by Stripe.
   - `checkout.session.completed` (paid) / `async_payment_succeeded` → amount & currency must equal the intent → intent `succeeded`, order `paid`, booking `confirmed`, ledger: `lesson_earning +gross`, `platform_fee −fee` (unique `(source_ref,kind,teacher)`), notifications + emails with dedupe keys. Courses → enrollment.
   - `async_payment_failed` → `payment_failed` (never downgrades a success). `checkout.session.expired` → booking `expired`.
   - Success for a booking that already expired/cancelled → booking unchanged, payment recorded, full refund queued (`refunds.status = requested`) for staff.
   - `refund.*` succeeded → refund `succeeded`, intent `refunded/partially_refunded`, booking `refunded`, ledger `refund_reversal −amount` and `fee_reversal +fee share`. failed → refund `failed` with the provider reason (visible, retryable).
   - `charge.dispute.created` → intent `disputed`, audit record.
4. Cancellation: student ≥ policy window or teacher any time → `refund_pending` + refund row → provider refund API (idempotency key `refund:<id>`) → `pending`; final state only from webhook. Provider error → `failed` with `last_error`; staff retry from **Admin → Refunds**.

## Policies (versioned, snapshotted on each booking)
- `flex-24h-v1`: full refund ≥24 h before start, none after.
- `moderate-48h-v1`: full ≥48 h, 50 % 24–48 h, none <24 h.
- Teacher cancellations are always fully refunded.

## Money
Integer minor units + ISO currency everywhere (`src/lib/money.ts`); TND uses 3 decimals. Fee = `PLATFORM_FEE_BPS` (default 1500 = 15 %), half-up integer rounding.

## Go-live checklist
1. Create Stripe account for an eligible entity; set `STRIPE_SECRET_KEY` (`sk_test_…` first).
2. Add webhook endpoint `https://<domain>/api/payments/webhook/stripe` with events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`; set `STRIPE_WEBHOOK_SECRET`.
3. Local test: `stripe listen --forward-to localhost:3000/api/payments/webhook/stripe`, book a paid lesson, pay with test card 4242…, confirm the booking turns `confirmed` and the ledger has two rows.
4. Verify currency support for each teacher currency (TND/MAD are not Stripe settlement currencies — restrict offerings to supported currencies or add a local PSP).
