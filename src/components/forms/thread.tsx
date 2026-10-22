"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { Alert, Button, inputClass } from "@/components/ui";
import { ReportButton } from "@/components/client/report-button";

type Att = { id: string; name: string; mime: string; sizeBytes: number };
type Msg = { id: string; body: string; mine: boolean; senderName: string; createdAt: number; attachments?: Att[] };

/**
 * Messaging thread. New messages arrive through a membership-checked server-sent-events stream
 * (Postgres LISTEN/NOTIFY); a slow 30 s poll remains as a fallback if the stream is unavailable.
 */
export function Thread({ conversationId, initial, blocked, iBlocked }: { conversationId: string; initial: Msg[]; blocked: boolean; iBlocked: boolean }) {
  const { t, locale } = useI18n();
  const [msgs, setMsgs] = useState(initial);
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [isBlocked, setBlocked] = useState(iBlocked);
  const [live, setLive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<number>(initial[initial.length - 1]?.createdAt ?? 0);
  useEffect(() => { lastRef.current = msgs[msgs.length - 1]?.createdAt ?? 0; }, [msgs]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  const fetchNew = useCallback(async () => {
    try {
      const r = await api<{ items: Msg[] }>(`/api/conversations/${conversationId}/messages?after=${lastRef.current}`);
      if (r.items.length) setMsgs((m) => [...m, ...r.items.filter((x) => !m.some((y) => y.id === x.id))]);
    } catch { /* transient */ }
  }, [conversationId]);

  useEffect(() => {
    let es: EventSource | null = null;
    if (typeof EventSource !== "undefined") {
      es = new EventSource(`/api/conversations/${conversationId}/stream`);
      es.addEventListener("ready", () => setLive(true));
      es.addEventListener("message", () => { void fetchNew(); });
      es.onerror = () => setLive(false);
    }
    const i = setInterval(() => { void fetchNew(); }, 30_000);
    return () => { clearInterval(i); es?.close(); };
  }, [conversationId, fetchNew]);

  const fmt = (ms: number) => new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(ms));
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted" data-testid="realtime-status">{live ? "● Live" : "○ Connecting…"}</p>
      <div className="h-[50vh] space-y-2 overflow-y-auto rounded-xl border border-line p-3" aria-live="polite">
        {msgs.length === 0 && <p className="text-sm text-muted">{t.common.empty}</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.mine ? "bg-brand-600 text-white" : "bg-canvas"}`}>
              <p className="whitespace-pre-line break-words">{m.body}</p>
              {m.attachments?.map((a) => (
                <a key={a.id} href={`/api/attachments/${a.id}`} className={`mt-1 block underline ${m.mine ? "text-white" : "text-brand-700"}`}>{a.name} ({Math.ceil(a.sizeBytes / 1024)} KB)</a>
              ))}
              <p className={`mt-1 text-[11px] ${m.mine ? "text-white/80" : "text-muted"}`}>{m.senderName} · {fmt(m.createdAt)}</p>
              {!m.mine && <ReportButton targetType="message" targetId={m.id} label="Report" sentLabel="Reported" />}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {err && <Alert tone="error">{err}</Alert>}
      {blocked && !isBlocked ? <Alert tone="warn">Messaging is blocked in this conversation.</Alert> : (
        <>
          <form className="flex gap-2" onSubmit={async (e) => {
            e.preventDefault(); if (!body.trim()) return; setErr(null);
            try { const r = await api<{ id: string; createdAt: number }>(`/api/conversations/${conversationId}/messages`, { body: { body } });
              setMsgs((m) => m.some((x) => x.id === r.id) ? m : [...m, { id: r.id, body, mine: true, senderName: "You", createdAt: r.createdAt }]); setBody(""); }
            catch (e2) { setErr(e2 instanceof ApiError ? e2.message : t.common.error); }
          }}>
            <label htmlFor="msg" className="sr-only">{t.nav.messages}</label>
            <textarea id="msg" rows={2} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} className={inputClass} disabled={isBlocked} />
            <Button type="submit" disabled={isBlocked}>{t.classroom.send}</Button>
          </form>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="attach" className="font-medium">Attach (PDF, PNG, JPEG, WebP · max 5 MB)</label>
            <input id="attach" ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" disabled={isBlocked || uploading} onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return; setErr(null); setUploading(true);
              try {
                const fd = new FormData(); fd.append("file", f);
                const res = await fetch(`/api/conversations/${conversationId}/attachments`, { method: "POST", body: fd, credentials: "same-origin" });
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error?.message ?? "Upload failed");
                setMsgs((m) => m.some((x) => x.id === data.id) ? m : [...m, { id: data.id, body: data.body, mine: true, senderName: "You", createdAt: data.createdAt, attachments: [data.attachment] }]);
              } catch (e3) { setErr(e3 instanceof Error ? e3.message : "Upload failed"); }
              finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
            }} />
          </div>
        </>
      )}
      <Button variant="ghost" onClick={async () => { await api(`/api/conversations/${conversationId}/block`, { body: { blocked: !isBlocked } }); setBlocked(!isBlocked); }}>{isBlocked ? "Unblock" : "Block this user"}</Button>
    </div>
  );
}
