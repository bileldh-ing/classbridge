import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { getBookingDetail } from "@/lib/services/bookings";
import { getI18n } from "@/lib/i18n/server";
import { isAppError } from "@/lib/errors";
import { Alert, Card, PageHeader } from "@/components/ui";
import { CheckoutPanel } from "@/components/lessons/forms";
import { formatMoney } from "@/lib/money";
import { fmtDateTime } from "@/lib/time";
import { providerStatus } from "@/lib/env";
import { POLICIES, isPolicyId } from "@/lib/policy/cancellation";

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUserPage(`/lessons/${id}/checkout`);
  const { t, locale } = await getI18n();
  let d;
  try { d = await getBookingDetail(getDb(), user, id); } catch (e) { if (isAppError(e) && e.code === "NOT_FOUND") notFound(); throw e; }
  if (d.viewerRole !== "student" || d.booking.status !== "slot_held") redirect(`/lessons/${id}`);
  const b = d.booking;
  const ps = providerStatus();
  const amount = b.priceMinor === 0 ? t.common.free : formatMoney(b.priceMinor, b.currency, locale);
  return (
    <div className="max-w-2xl">
      <PageHeader title={t.booking.review} />
      {sp.checkout === "canceled" && <Alert tone="warn" className="mb-4">Checkout was cancelled — you have not been charged.</Alert>}
      <Card className="mb-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">{t.booking.chooseLesson.replace(/^1\.\s*/, "")}</dt><dd className="font-medium">{d.offering.title} ({d.offering.durationMinutes} {t.common.minutes})</dd></div>
          <div><dt className="text-muted">{t.lessons.with}</dt><dd className="font-medium">{d.teacherName}</dd></div>
          <div><dt className="text-muted">{t.common.date}</dt><dd className="font-medium">{fmtDateTime(b.startsAt, user.timezone, locale, { dateStyle: "full", timeStyle: "short" })}</dd><dd className="text-xs text-muted">{user.timezone}</dd></div>
          <div><dt className="text-muted">{t.common.total}</dt><dd className="text-lg font-semibold">{amount}</dd></div>
        </dl>
      </Card>
      <Card>
        <CheckoutPanel bookingId={b.id} free={b.priceMinor === 0} holdExpiresAt={b.holdExpiresAt?.getTime() ?? null} amountLabel={amount}
          paymentsConfigured={!!ps.payments} testMode={ps.paymentsTestMode} policySummary={isPolicyId(b.cancellationPolicy) ? POLICIES[b.cancellationPolicy].summary : b.cancellationPolicy} />
      </Card>
    </div>
  );
}
