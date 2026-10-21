"use client";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { Alert, Button, inputClass } from "@/components/ui";
import { ReportButton } from "@/components/client/report-button";

type Msg = { id: string; body: string; mine: boolean; senderName: string; createdAt: number };

/** Persisted messaging with 8s polling (no websocket infrastructure in this build). */
export function Thread({ conversationId, initial, blocked, iBlocked }: { conversationId: string; initial: Msg[]; blocked: boolean; iBlocked: boolean }) {
  const { t, locale } = useI18n();
  const [msgs, setMsgs] = useState(initial);
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [isBlocked, setBlocked] = useState(iBlocked);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);
  useEffect(() => {
    const i = setInterval(async () => {
      const last = msgs[msgs.length - 1]?.createdAt ?? 0;
      try {
        const r = await api<{ items: Msg[] }>(`/api/conversations/${conversationId}/messages?after=${last}`);
        if (r.items.length) setMsgs((m) => [...m, ...r.items.filter((x) => !m.some((y) => y.id === x.id))]);
      } catch { /* transient */ }
    }, 8000);
    return () => clearInterval(i);
  }, [conversationId, msgs]);
  const fmt = (ms: number) => new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(ms));
  return (
    <div className="space-y-3">
      <div className="h-[50vh] space-y-2 overflow-y-auto rounded-xl border border-line p-3" aria-live="polite">
        {msgs.length === 0 && <p className="text-sm text-muted">{t.common.empty}</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.mine ? "bg-brand-600 text-white" : "bg-canvas"}`}>
              <p className="whitespace-pre-line break-words">{m.body}</p>
              <p className={`mt-1 text-[11px] ${m.mine ? "text-white/80" : "text-muted"}`}>{m.senderName} · {fmt(m.createdAt)}</p>
              {!m.mine && <ReportButton targetType="message" targetId={m.id} label="Report" sentLabel="Reported" />}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {err && <Alert tone="error">{err}</Alert>}
      {blocked && !isBlocked ? <Alert tone="warn">Messaging is blocked in this conversation.</Alert> : (
        <form className="flex gap-2" onSubmit={async (e) => {
          e.preventDefault(); if (!body.trim()) return; setErr(null);
          try { const r = await api<{ id: string; createdAt: number }>(`/api/conversations/${conversationId}/messages`, { body: { body } });
            setMsgs((m) => [...m, { id: r.id, body, mine: true, senderName: "You", createdAt: r.createdAt }]); setBody(""); }
          catch (e2) { setErr(e2 instanceof ApiError ? e2.message : t.common.error); }
        }}>
          <label htmlFor="msg" className="sr-only">{t.nav.messages}</label>
          <textarea id="msg" rows={2} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} className={inputClass} disabled={isBlocked} />
          <Button type="submit" disabled={isBlocked}>{t.classroom.send}</Button>
        </form>
      )}
      <Button variant="ghost" onClick={async () => { await api(`/api/conversations/${conversationId}/block`, { body: { blocked: !isBlocked } }); setBlocked(!isBlocked); }}>{isBlocked ? "Unblock" : "Block this user"}</Button>
    </div>
  );
}
