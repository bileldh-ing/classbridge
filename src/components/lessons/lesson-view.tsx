import Link from "next/link";
import { CalendarPlus, Video, MapPin } from "lucide-react";
import type { getBookingDetail } from "@/lib/services/bookings";
import { joinWindow } from "@/lib/services/bookings";
import type { SessionUser } from "@/lib/auth/core";
import type { Locale, Messages } from "@/lib/i18n/messages";
import { fmtDateTime } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { refundableAmount, POLICIES, isPolicyId } from "@/lib/policy/cancellation";
import { Alert, buttonClass, Card, StatusBadge, PageHeader, DemoBadge } from "@/components/ui";
import { CancelForm, CompleteLessonForm, MessageButton, NoteForm, ReviewForm } from "./forms";

type Detail = Awaited<ReturnType<typeof getBookingDetail>>;

export function LessonView({ d, user, t, locale, canReview, reviewed, banner }: { d: Detail; user: SessionUser; t: Messages; locale: Locale; canReview: boolean; reviewed: boolean; banner?: React.ReactNode }) {
  const b = d.booking;
  const tz = user.timezone;
  const isTeacher = d.viewerRole === "teacher";
  const now = new Date();
  const { opensAt, closesAt } = joinWindow(b);
  const joinable = b.mode === "online" && ["confirmed", "in_progress"].includes(b.status) && now >= opensAt && now <= closesAt;
  const statusLabel = t.booking.statuses[b.status];
  const refund = !isTeacher && b.status === "confirmed" && b.paymentStatus === "succeeded"
    ? refundableAmount({ policy: b.cancellationPolicy, priceMinor: b.priceMinor, startsAt: b.startsAt, canceledAt: now, canceledBy: "student" }) : null;
  const canCancel = (["slot_held", "awaiting_payment"].includes(b.status) && !isTeacher) || (b.status === "confirmed" && b.startsAt > now);
  const policy = isPolicyId(b.cancellationPolicy) ? POLICIES[b.cancellationPolicy].summary : b.cancellationPolicy;
  return (
    <div className="space-y-5">
      {banner}
      <PageHeader title={d.offering.title} subtitle={<span>{t.lessons.with} {isTeacher ? d.studentName : <Link className="underline" href={`/teachers/${d.teacherSlug}`}>{d.teacherName}</Link>}</span>}
        actions={<div className="flex items-center gap-2">{b.isDemo && <DemoBadge label={t.common.demo} />}<StatusBadge status={b.status} label={statusLabel} /></div>} />
      <Card className="grid gap-4 sm:grid-cols-2">
        <dl className="space-y-2 text-sm">
          <div><dt className="text-muted">{t.common.date}</dt><dd className="font-medium">{fmtDateTime(b.startsAt, tz, locale, { dateStyle: "full", timeStyle: "short" })} – {fmtDateTime(b.endsAt, tz, locale, { timeStyle: "short" })}</dd><dd className="text-xs text-muted">{tz}</dd></div>
          <div><dt className="text-muted">{t.search.format}</dt><dd>{b.mode === "online" ? t.common.online : t.common.inPerson}</dd></div>
          <div><dt className="text-muted">{t.common.total}</dt><dd>{b.priceMinor === 0 ? t.common.free : formatMoney(b.priceMinor, b.currency, locale)} · <span className="text-muted">{b.paymentStatus.replace(/_/g, " ")}</span></dd></div>
          {d.meetingArea && <div><dt className="text-muted">{t.lessons.meetingArea}</dt><dd className="flex items-center gap-1"><MapPin aria-hidden className="size-4" />{d.meetingArea.city}, {d.meetingArea.country}</dd><dd className="text-xs text-muted">{t.lessons.meetingAreaHint}</dd></div>}
          {b.intakeAnswer && <div><dt className="text-muted">{t.booking.intake}</dt><dd>{b.intakeAnswer}</dd></div>}
        </dl>
        <div className="flex flex-col items-start gap-2">
          {["slot_held"].includes(b.status) && !isTeacher && <Link className={buttonClass("primary")} href={`/lessons/${b.id}/checkout`}>{t.lessons.completePayment}</Link>}
          {b.mode === "online" && ["confirmed", "in_progress"].includes(b.status) && (
            joinable ? <Link className={buttonClass("primary")} href={`/lessons/${b.id}/classroom`}><Video aria-hidden className="size-4" />{t.lessons.join}</Link>
              : <p className="text-sm text-muted">{t.lessons.joinOpens}</p>
          )}
          {["confirmed", "in_progress", "completed"].includes(b.status) && <a className={buttonClass("secondary")} href={`/api/bookings/${b.id}/ics`}><CalendarPlus aria-hidden className="size-4" />{t.lessons.addToCalendar}</a>}
          {b.status !== "slot_held" && <MessageButton bookingId={b.id} label={t.lessons.message} />}
          {canCancel && <CancelForm bookingId={b.id} refundLabel={refund !== null ? formatMoney(refund, b.currency, locale) : null} />}
        </div>
      </Card>
      <p className="text-xs text-muted">{t.teacher.cancellation}: {policy}</p>
      {isTeacher && ["confirmed", "in_progress"].includes(b.status) && (
        <Card><h2 className="mb-3 font-semibold">Attendance & lesson record</h2>
          {now >= b.startsAt ? <CompleteLessonForm bookingId={b.id} /> : <Alert tone="info">You can record attendance once the lesson has started.</Alert>}</Card>
      )}
      {!isTeacher && canReview && <Card><h2 className="mb-3 font-semibold">{t.lessons.leaveReview}</h2><ReviewForm bookingId={b.id} /></Card>}
      {!isTeacher && reviewed && <Alert tone="success">{t.lessons.reviewThanks}</Alert>}
      <Card><h2 className="mb-3 font-semibold">{t.lessons.notes}</h2>
        {d.notes.length === 0 ? <p className="text-sm text-muted">{t.common.empty}</p> : (
          <ul className="space-y-3">{d.notes.map((n) => <li key={n.id} className="rounded-md bg-canvas p-3 text-sm"><p className="whitespace-pre-line">{n.body}</p>
            {n.materialsUrl && <a href={n.materialsUrl} className="mt-1 inline-block text-brand-700 underline" rel="noopener noreferrer nofollow" target="_blank">{n.materialsUrl}</a>}
            <p className="mt-1 text-xs text-muted">{fmtDateTime(n.createdAt, tz, locale)}</p></li>)}</ul>
        )}
        {isTeacher && ["in_progress", "completed", "confirmed"].includes(b.status) && <div className="mt-4"><NoteForm bookingId={b.id} /></div>}
      </Card>
      <Card><h2 className="mb-3 font-semibold">{t.lessons.history}</h2>
        <ol className="space-y-1 text-sm">{d.events.map((e) => (
          <li key={e.id} className="flex flex-wrap gap-2"><span className="text-muted">{fmtDateTime(e.createdAt, tz, locale)}</span><span>{e.fromStatus ? `${t.booking.statuses[e.fromStatus]} → ` : ""}<strong>{t.booking.statuses[e.toStatus]}</strong></span><span className="text-muted">({e.actorRole}{e.reason ? `: ${e.reason}` : ""})</span></li>
        ))}</ol>
      </Card>
    </div>
  );
}
