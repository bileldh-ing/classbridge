"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, ApiError } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { Alert, Button, FieldError, inputClass, Label } from "@/components/ui";

export function CheckoutPanel({ bookingId, free, holdExpiresAt, amountLabel, paymentsConfigured, testMode, policySummary }: {
  bookingId: string; free: boolean; holdExpiresAt: number | null; amountLabel: string; paymentsConfigured: boolean; testMode: boolean; policySummary: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const remaining = holdExpiresAt ? Math.max(0, holdExpiresAt - now) : 0;
  const expired = holdExpiresAt !== null && remaining === 0;
  const mm = Math.floor(remaining / 60000), ss = Math.floor((remaining % 60000) / 1000);
  const timeLabel = holdExpiresAt ? new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(holdExpiresAt)) : "";
  return (
    <div className="space-y-4">
      {holdExpiresAt && !expired && <Alert tone="info">{t.booking.held.replace("{time}", timeLabel)} <span className="font-mono" aria-live="off">({mm}:{String(ss).padStart(2, "0")})</span></Alert>}
      {expired && <Alert tone="warn">{t.booking.holdExpired}</Alert>}
      <div className="rounded-lg bg-canvas p-3 text-sm"><p className="font-medium">{t.teacher.cancellation}</p><p className="text-muted">{policySummary}</p></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />{t.booking.policyAck}</label>
      {!free && !paymentsConfigured && <Alert tone="warn">{t.booking.paymentNotConfigured}</Alert>}
      {!free && paymentsConfigured && testMode && <Alert tone="info">{t.booking.testMode}</Alert>}
      {err && <Alert tone="error">{err}</Alert>}
      <Button className="w-full" disabled={!ack || busy || expired || (!free && !paymentsConfigured)} onClick={async () => {
        setBusy(true); setErr(null);
        try {
          if (free) { await api(`/api/bookings/${bookingId}/confirm-free`, { body: {} }); router.push(`/lessons/${bookingId}?confirmed=1`); router.refresh(); }
          else { const r = await api<{ url: string }>("/api/checkout", { body: { bookingId } }); window.location.assign(r.url); }
        } catch (e) { setErr(e instanceof ApiError ? e.message : t.common.error); setBusy(false); }
      }}>{busy ? (free ? t.common.loading : t.booking.redirecting) : free ? t.booking.confirmFree : t.booking.payWith.replace("{amount}", amountLabel)}</Button>
    </div>
  );
}

export function CancelForm({ bookingId, refundLabel }: { bookingId: string; refundLabel: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>{t.lessons.cancel}</Button>;
  return (
    <form className="space-y-2 rounded-lg border border-line p-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { await api(`/api/bookings/${bookingId}/cancel`, { body: { reason } }); router.refresh(); setOpen(false); }
      catch (e2) { setErr(e2 instanceof ApiError ? e2.message : t.common.error); } finally { setBusy(false); }
    }}>
      <Label htmlFor="cancel-reason">{t.lessons.cancelReason}</Label>
      <textarea id="cancel-reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} rows={2} />
      {refundLabel !== null && <p className="text-sm text-muted">{t.lessons.refundInfo.replace("{amount}", refundLabel)}</p>}
      {err && <Alert tone="error">{err}</Alert>}
      <div className="flex gap-2"><Button type="submit" variant="danger" disabled={busy}>{t.lessons.cancelConfirm}</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t.common.close}</Button></div>
    </form>
  );
}

const reviewForm = z.object({ rating: z.coerce.number().int().min(1).max(5), body: z.string().max(2000) });
export function ReviewForm({ bookingId }: { bookingId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm({ resolver: zodResolver(reviewForm), defaultValues: { rating: 5, body: "" } });
  if (done) return <Alert tone="success">{t.lessons.reviewThanks}</Alert>;
  return (
    <form className="space-y-3" onSubmit={handleSubmit(async (v) => {
      try { await api("/api/reviews", { body: { bookingId, ...v } }); setDone(true); router.refresh(); } catch (e) { setErr(e instanceof ApiError ? e.message : t.common.error); }
    })}>
      <fieldset><legend className="mb-1 text-sm font-medium">{t.lessons.rating}</legend>
        <div className="flex gap-3">{[1, 2, 3, 4, 5].map((n) => <label key={n} className="flex items-center gap-1 text-sm"><input type="radio" value={n} {...register("rating")} />{n}★</label>)}</div></fieldset>
      <div><Label htmlFor="review-body">{t.lessons.reviewBody}</Label><textarea id="review-body" rows={3} className={inputClass} {...register("body")} /><FieldError message={errors.body?.message} /></div>
      {err && <Alert tone="error">{err}</Alert>}
      <Button type="submit" disabled={isSubmitting}>{t.common.submit}</Button>
    </form>
  );
}

export function CompleteLessonForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [att, setAtt] = useState("present");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { await api(`/api/bookings/${bookingId}/complete`, { body: { studentAttendance: att, note: note || undefined, materialsUrl: url || undefined } }); router.refresh(); }
      catch (e2) { setErr(e2 instanceof ApiError ? e2.message : "Error"); } finally { setBusy(false); }
    }}>
      <fieldset><legend className="mb-1 text-sm font-medium">Student attendance</legend>
        <div className="flex gap-4 text-sm">{[["present", "Present"], ["late", "Late"], ["absent", "Absent (no-show)"]].map(([v, l]) => <label key={v} className="flex items-center gap-1"><input type="radio" name="att" checked={att === v} onChange={() => setAtt(v)} />{l}</label>)}</div></fieldset>
      <div><Label htmlFor="note">Lesson notes (visible to the student)</Label><textarea id="note" rows={3} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} /></div>
      <div><Label htmlFor="mat">Materials link (https, optional)</Label><input id="mat" type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="https://" /></div>
      {err && <Alert tone="error">{err}</Alert>}
      <Button type="submit" disabled={busy}>Record attendance & complete</Button>
    </form>
  );
}

export function NoteForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault(); setErr(null);
      try { await api(`/api/bookings/${bookingId}/notes`, { body: { body } }); setBody(""); router.refresh(); } catch (e2) { setErr(e2 instanceof ApiError ? e2.message : "Error"); }
    }}>
      <Label htmlFor="extra-note">Add a note</Label>
      <textarea id="extra-note" rows={2} required maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} className={inputClass} />
      {err && <Alert tone="error">{err}</Alert>}
      <Button type="submit" variant="secondary">Add note</Button>
    </form>
  );
}

export function MessageButton({ bookingId, label }: { bookingId: string; label: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <Button variant="secondary" onClick={async () => {
        try { const c = await api<{ id: string }>("/api/conversations", { body: { bookingId } }); router.push(`/messages/${c.id}`); } catch (e) { setErr(e instanceof ApiError ? e.message : "Error"); }
      }}>{label}</Button>
      {err && <span role="alert" className="ms-2 text-sm text-red-700">{err}</span>}
    </span>
  );
}
