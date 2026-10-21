import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings, lessonOfferings, profiles, teacherProfiles } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { Card, PageHeader, StatusBadge, Badge } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { allowed, Denied } from "../guard";
import { alias } from "drizzle-orm/pg-core";

export default async function AdminBookings() {
  const user = await requireUserPage("/admin/bookings");
  if (!allowed(user, "admin.view_payments")) return <Denied />;
  const tprof = alias(profiles, "tprof");
  const rows = await getDb().select({ b: bookings, title: lessonOfferings.title, student: profiles.displayName, teacher: tprof.displayName, events: sql<number>`(SELECT count(*)::int FROM booking_events e WHERE e.booking_id = ${bookings.id})` })
    .from(bookings).innerJoin(lessonOfferings, eq(lessonOfferings.id, bookings.offeringId)).innerJoin(profiles, eq(profiles.userId, bookings.studentId))
    .innerJoin(teacherProfiles, eq(teacherProfiles.id, bookings.teacherId)).innerJoin(tprof, eq(tprof.userId, teacherProfiles.userId))
    .orderBy(desc(bookings.createdAt)).limit(100);
  return (
    <div>
      <PageHeader title="Bookings" subtitle="Booking, payment and attendance states are tracked separately." />
      <Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-muted"><th className="py-2 text-start">Starts (UTC)</th><th className="text-start">Lesson</th><th className="text-start">Student → Teacher</th><th className="text-start">Booking</th><th className="text-start">Payment</th><th className="text-start">Attendance</th><th className="text-start">Amount</th><th className="text-start">Events</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.b.id} className="border-t border-line"><td className="py-2">{r.b.startsAt.toISOString().slice(0, 16).replace("T", " ")}</td><td>{r.title} {r.b.isDemo && <Badge tone="demo">DEMO</Badge>}</td><td>{r.student} → {r.teacher}</td><td><StatusBadge status={r.b.status} label={r.b.status} /></td><td>{r.b.paymentStatus}</td><td>{r.b.attendanceStatus ?? "—"}</td><td>{formatMoney(r.b.priceMinor, r.b.currency)}</td><td>{r.events}</td></tr>)}</tbody></table></Card>
    </div>
  );
}
