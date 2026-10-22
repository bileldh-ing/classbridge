import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assertMember } from "@/lib/services/messaging";
import { requireFlag } from "@/lib/services/flags";
import { subscribeConversation } from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-sent events for one conversation. Membership is checked before subscribing; events only carry the new
 * message id, so clients still fetch content through the authorised messages API.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await requireUser();
    const { id } = await params;
    const db = getDb();
    await requireFlag(db, "realtime_messaging", "Realtime messaging");
    await assertMember(db, u.id, id);
    const enc = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch { cleanup(); } };
        send(`retry: 5000\nevent: ready\ndata: {}\n\n`);
        const unsub = await subscribeConversation(id, (e) => send(`event: message\ndata: ${JSON.stringify(e)}\n\n`));
        const ping = setInterval(() => send(`: ping\n\n`), 25_000);
        cleanup = () => { clearInterval(ping); unsub(); try { controller.close(); } catch { /* closed */ } };
        req.signal.addEventListener("abort", () => cleanup());
      },
      cancel() { cleanup(); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (e) {
    return errorResponse(e);
  }
}
