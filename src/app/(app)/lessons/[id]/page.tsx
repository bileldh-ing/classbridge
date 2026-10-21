import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { getBookingDetail } from "@/lib/services/bookings";
import { reviewEligibility } from "@/lib/services/reviews";
import { getI18n } from "@/lib/i18n/server";
import { isAppError } from "@/lib/errors";
import { LessonView } from "@/components/lessons/lesson-view";
import { Alert } from "@/components/ui";
import { reviews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default async function LessonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ confirmed?: string; checkout?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUserPage(`/lessons/${id}`);
  const { t, locale } = await getI18n();
  const db = getDb();
  let d;
  try { d = await getBookingDetail(db, user, id); } catch (e) { if (isAppError(e) && e.code === "NOT_FOUND") notFound(); throw e; }
  const el = await reviewEligibility(db, user, id);
  const reviewed = (await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.bookingId, id))).length > 0;
  const banner = sp.confirmed ? <Alert tone="success">{t.booking.confirmed}</Alert>
    : sp.checkout === "success" ? <Alert tone="info">Payment submitted. Your lesson is confirmed as soon as the payment provider verifies it — refresh in a moment.</Alert> : undefined;
  return <LessonView d={d} user={user} t={t} locale={locale} canReview={el.eligible} reviewed={reviewed && d.viewerRole === "student"} banner={banner} />;
}
