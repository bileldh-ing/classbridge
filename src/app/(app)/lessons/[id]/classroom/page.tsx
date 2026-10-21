import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { getBookingDetail, joinWindow } from "@/lib/services/bookings";
import { getI18n } from "@/lib/i18n/server";
import { isAppError } from "@/lib/errors";
import { providerStatus } from "@/lib/env";
import { Alert, PageHeader } from "@/components/ui";
import { Classroom } from "@/components/lessons/classroom";
import { fmtDateTime } from "@/lib/time";

export default async function ClassroomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserPage(`/lessons/${id}/classroom`);
  const { t, locale } = await getI18n();
  let d;
  try { d = await getBookingDetail(getDb(), user, id); } catch (e) { if (isAppError(e) && e.code === "NOT_FOUND") notFound(); throw e; }
  const b = d.booking;
  const { opensAt, closesAt } = joinWindow(b);
  const now = new Date();
  const back = d.viewerRole === "teacher" ? `/teach/bookings/${id}` : `/lessons/${id}`;
  let block: React.ReactNode = null;
  if (d.viewerRole === "admin") block = <Alert tone="warn">{t.classroom.denied}</Alert>;
  else if (b.mode !== "online" || !["confirmed", "in_progress"].includes(b.status)) block = <Alert tone="warn">{t.classroom.denied} ({t.booking.statuses[b.status]})</Alert>;
  else if (now < opensAt || now > closesAt) block = <Alert tone="info">{t.classroom.outsideWindow} ({fmtDateTime(opensAt, user.timezone, locale)} – {fmtDateTime(closesAt, user.timezone, locale, { timeStyle: "short" })})</Alert>;
  else if (!providerStatus().classroom) block = <Alert tone="warn" title={t.common.notConfigured}>{t.classroom.notConfigured}</Alert>;
  return (
    <div>
      <PageHeader title={`${t.classroom.title}: ${d.offering.title}`} subtitle={<Link className="underline" href={back}>{t.common.back}</Link>} />
      {block ?? <Classroom bookingId={id} />}
    </div>
  );
}
