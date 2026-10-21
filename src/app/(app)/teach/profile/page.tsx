import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teacherLocations, teacherSubjects } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { requireTeacher } from "@/lib/services/teachers";
import { listCities, listSubjects, subjectName } from "@/lib/services/catalog";
import { getI18n } from "@/lib/i18n/server";
import { providerStatus } from "@/lib/env";
import { Card, PageHeader } from "@/components/ui";
import { BookingSettingsForm, LocationForm, TeacherProfileForm } from "@/components/forms/teacher-forms";

export default async function TeacherProfilePage() {
  const user = await requireUserPage("/teach/profile");
  const { t, locale } = await getI18n();
  const db = getDb();
  const tp = await requireTeacher(db, user.id);
  const [subs, mine, cities, [loc]] = await Promise.all([
    listSubjects(db), db.select({ id: teacherSubjects.subjectId }).from(teacherSubjects).where(eq(teacherSubjects.teacherId, tp.id)),
    listCities(db), db.select().from(teacherLocations).where(eq(teacherLocations.teacherId, tp.id)),
  ]);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t.nav.publicProfile} subtitle="Only published fields appear on your public page. Identity documents are never public." />
      <Card><TeacherProfileForm subjects={subs.map((s) => ({ id: s.id, name: subjectName(s, locale) }))}
        initial={{ headline: tp.headline, bio: tp.bio, teachingApproach: tp.teachingApproach, yearsExperience: tp.yearsExperience, languages: tp.languages, levels: tp.levels,
          subjectIds: mine.map((m) => m.id), timezone: tp.timezone, hourlyRateMinor: tp.hourlyRateMinor, currency: tp.currency, offersOnline: tp.offersOnline,
          offersInPerson: tp.offersInPerson, introVideoUrl: tp.introVideoUrl, cancellationPolicy: tp.cancellationPolicy }} /></Card>
      <Card><h2 className="mb-3 font-semibold">{t.teacher.location}</h2>
        <LocationForm cities={cities.map((c) => ({ id: c.id, name: c.name, country: c.country }))} current={loc ? { city: loc.city, country: loc.country, visibility: loc.visibility, source: loc.source } : null} geocoderAvailable={!!providerStatus().geocoding} /></Card>
      <Card><h2 className="mb-3 font-semibold">Booking rules</h2><BookingSettingsForm initial={{ minNoticeMinutes: tp.minNoticeMinutes, bufferMinutes: tp.bufferMinutes, maxLessonsPerDay: tp.maxLessonsPerDay, bookingHorizonDays: tp.bookingHorizonDays }} /></Card>
    </div>
  );
}
