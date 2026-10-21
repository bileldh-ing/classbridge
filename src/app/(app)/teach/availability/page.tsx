import { asc, eq, gte, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { availabilityExceptions, availabilityRules } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { requireTeacher } from "@/lib/services/teachers";
import { getI18n } from "@/lib/i18n/server";
import { fmtDateTime } from "@/lib/time";
import { Card, PageHeader } from "@/components/ui";
import { AvailabilityEditor, ExceptionForm } from "@/components/forms/teacher-forms";
import { ActionButton } from "@/components/client/action-button";

export default async function AvailabilityPage() {
  const user = await requireUserPage("/teach/availability");
  const { t, locale } = await getI18n();
  const db = getDb();
  const tp = await requireTeacher(db, user.id);
  const rules = await db.select().from(availabilityRules).where(eq(availabilityRules.teacherId, tp.id)).orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startMinute));
  const exc = await db.select().from(availabilityExceptions).where(and(eq(availabilityExceptions.teacherId, tp.id), gte(availabilityExceptions.endsAt, new Date()))).orderBy(asc(availabilityExceptions.startsAt));
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t.nav.availability} subtitle="Students only ever see slots generated from these rules minus bookings, buffers, notice and exceptions." />
      <Card><AvailabilityEditor timezone={tp.timezone} initial={rules.map((r) => ({ weekday: r.weekday, startMinute: r.startMinute, endMinute: r.endMinute }))} /></Card>
      <Card><h2 className="mb-3 font-semibold">Exceptions (holidays, time off, extra hours)</h2>
        <p className="mb-2 text-xs text-muted">Times entered in your browser's local time.</p>
        <ExceptionForm />
        <ul className="mt-4 space-y-2 text-sm">{exc.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2"><span>{e.kind === "blocked" ? "Blocked" : "Extra"}: {fmtDateTime(e.startsAt, tp.timezone, locale)} → {fmtDateTime(e.endsAt, tp.timezone, locale)} {e.reason && `(${e.reason})`}</span>
            <ActionButton endpoint="/api/availability/exceptions" method="DELETE" body={{ id: e.id }} label="Remove" variant="ghost" /></li>))}</ul>
      </Card>
    </div>
  );
}
