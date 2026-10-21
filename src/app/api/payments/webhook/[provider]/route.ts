import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { getProviderByName } from "@/lib/payments/stripe";
import { handleProviderEvent } from "@/lib/payments/webhooks";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Provider webhook. The RAW body is verified against the provider signature before anything is parsed or stored.
 * Not cookie-authenticated, so no CSRF origin check (the signature is the authentication).
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider: name } = await params;
    const provider = getProviderByName(name);
    if (!provider) throw new AppError("PAYMENT_PROVIDER_NOT_CONFIGURED", `Payment provider "${name}" is not configured.`);
    const raw = await req.text();
    if (raw.length > 1_000_000) throw new AppError("VALIDATION_FAILED", "Payload too large");
    const ev = provider.verifyWebhook(raw, req.headers.get("stripe-signature"));
    const outcome = await handleProviderEvent(getDb(), provider.name, ev, provider.normalize(ev));
    log.info("webhook_received", { provider: name, eventId: ev.id, type: ev.type, outcome: outcome.status });
    return NextResponse.json({ received: true, ...outcome });
  } catch (e) {
    return errorResponse(e);
  }
}
