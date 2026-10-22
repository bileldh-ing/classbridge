import Link from "next/link";
import type { getBookingDetail } from "@/lib/services/bookings";
import { RESCHEDULE_POLICY } from "@/lib/services/reschedule";
import { Card } from "@/components/ui";
import { JsonForm } from "@/components/client/json-form";

type Detail = Awaited<ReturnType<typeof getBookingDetail>>;

/** Reschedule (confirmed 1:1 lessons) + help link, shown under the lesson detail for both participants. */
export function LessonExtras({ d }: { d: Detail }) {
  const b = d.booking;
  const canMove = b.status === "confirmed" && !b.groupSessionId && (d.viewerRole === "student" || d.viewerRole === "teacher") && b.rescheduleCount < RESCHEDULE_POLICY.maxReschedules;
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {canMove && (
        <Card data-testid="reschedule-card">
          <h2 className="mb-1 font-semibold">Reschedule</h2>
          <p className="mb-2 text-xs text-muted">Students can move a lesson up to {RESCHEDULE_POLICY.studentMinNoticeHours} h before it starts, teachers up to {RESCHEDULE_POLICY.teacherMinNoticeHours} h; at most {RESCHEDULE_POLICY.maxReschedules} times. The new time must be free in the teacher&apos;s availability ({b.rescheduleCount} used).</p>
          <JsonForm endpoint={`/api/bookings/${b.id}/reschedule`} submitLabel="Move lesson" successText="Lesson moved. The other participant was notified." fields={[
            { name: "startsAt", label: "New start (your device's time zone)", type: "datetime", required: true },
            { name: "reason", label: "Reason", required: true },
          ]} />
        </Card>
      )}
      <Card><h2 className="mb-1 font-semibold">Need help with this lesson?</h2><p className="text-sm"><Link className="underline" href={`/support?booking=${b.id}`}>Contact support</Link> — mention what happened; the booking is attached automatically.</p></Card>
    </div>
  );
}
