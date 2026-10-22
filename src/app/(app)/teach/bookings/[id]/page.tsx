import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { getBookingDetail } from "@/lib/services/bookings";
import { getI18n } from "@/lib/i18n/server";
import { isAppError } from "@/lib/errors";
import { LessonView } from "@/components/lessons/lesson-view";
import { LessonExtras } from "@/components/lessons/reschedule-card";

export default async function TeacherBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserPage(`/teach/bookings/${id}`);
  const { t, locale } = await getI18n();
  let d;
  try { d = await getBookingDetail(getDb(), user, id); } catch (e) { if (isAppError(e) && e.code === "NOT_FOUND") notFound(); throw e; }
  if (d.viewerRole !== "teacher") notFound();
  return <><LessonView d={d} user={user} t={t} locale={locale} canReview={false} reviewed={false} /><LessonExtras d={d} /></>;
}
