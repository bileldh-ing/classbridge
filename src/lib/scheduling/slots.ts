/**
 * Availability → bookable slots. Pure and deterministic (pass `now`), DST-safe via Luxon.
 * Weekly rules are expressed in the TEACHER's IANA timezone (wall-clock), slots are returned in UTC.
 */
import { DateTime } from "luxon";

export type Rule = { weekday: number; startMinute: number; endMinute: number }; // ISO weekday 1..7
export type Exception = { kind: "blocked" | "extra"; startsAt: Date; endsAt: Date };
export type Busy = { startsAt: Date; endsAt: Date };

export type SlotInput = {
  rules: Rule[];
  exceptions: Exception[];
  busy: Busy[];
  teacherTimezone: string;
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  maxLessonsPerDay: number;
  horizonDays: number;
  stepMinutes?: number;
  now: Date;
  from: Date;
  to: Date;
};

export function isValidTimezone(tz: string): boolean {
  return DateTime.local().setZone(tz).isValid;
}

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

export function generateSlots(input: SlotInput): Date[] {
  const {
    rules, exceptions, busy, teacherTimezone: tz, durationMinutes, bufferMinutes,
    minNoticeMinutes, maxLessonsPerDay, horizonDays, now, from, to,
  } = input;
  const step = input.stepMinutes ?? 30;
  if (!isValidTimezone(tz)) throw new Error(`Invalid timezone ${tz}`);
  const durMs = durationMinutes * 60_000;
  const bufMs = bufferMinutes * 60_000;
  const earliest = Math.max(from.getTime(), now.getTime() + minNoticeMinutes * 60_000);
  const latest = Math.min(to.getTime(), now.getTime() + horizonDays * 86_400_000);
  if (earliest >= latest) return [];

  // Candidate windows (UTC ms) from weekly rules, day by day in the teacher's zone.
  const windows: Array<[number, number]> = [];
  let day = DateTime.fromMillis(earliest, { zone: tz }).startOf("day").minus({ days: 1 });
  const lastDay = DateTime.fromMillis(latest, { zone: tz }).endOf("day");
  while (day <= lastDay) {
    for (const r of rules.filter((x) => x.weekday === day.weekday)) {
      const s = wallClock(day, r.startMinute, tz);
      const e = wallClock(day, r.endMinute, tz);
      if (s !== null && e !== null && s < e) windows.push([s, e]);
    }
    day = day.plus({ days: 1 });
  }
  for (const x of exceptions) if (x.kind === "extra") windows.push([x.startsAt.getTime(), x.endsAt.getTime()]);

  const blocked = exceptions.filter((x) => x.kind === "blocked").map((x) => [x.startsAt.getTime(), x.endsAt.getTime()] as const);
  const busyMs = busy.map((b) => [b.startsAt.getTime() - bufMs, b.endsAt.getTime() + bufMs] as const);

  // Per teacher-local-day count of existing lessons for maxLessonsPerDay.
  const perDay = new Map<string, number>();
  for (const b of busy) {
    const k = DateTime.fromJSDate(b.startsAt, { zone: tz }).toISODate()!;
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }

  const out = new Set<number>();
  for (const [ws, we] of windows) {
    for (let t = ws; t + durMs <= we; t += step * 60_000) {
      if (t < earliest) continue;
      if (t >= latest) break;
      const end = t + durMs;
      if (blocked.some(([bs, be]) => overlaps(t, end, bs, be))) continue;
      if (busyMs.some(([bs, be]) => overlaps(t, end, bs, be))) continue;
      const dayKey = DateTime.fromMillis(t, { zone: tz }).toISODate()!;
      if ((perDay.get(dayKey) ?? 0) >= maxLessonsPerDay) continue;
      out.add(t);
    }
  }
  return [...out].sort((a, b) => a - b).map((t) => new Date(t));
}

/**
 * Local wall-clock minute-of-day → UTC ms. A wall time inside a DST gap (e.g. 02:30 on spring-forward day)
 * is shifted forward to the first valid instant, so a 02:00–04:00 window becomes 03:00–04:00 that day.
 * Ambiguous autumn times resolve to the earlier offset.
 */
function wallClock(day: DateTime, minuteOfDay: number, tz: string): number | null {
  if (minuteOfDay === 1440) return day.plus({ days: 1 }).startOf("day").toMillis();
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const dt = DateTime.fromObject({ year: day.year, month: day.month, day: day.day, hour, minute }, { zone: tz });
  if (!dt.isValid) return null;
  return dt.toMillis();
}

export function isSlotBookable(input: SlotInput, start: Date): boolean {
  const s = start.getTime();
  return generateSlots({ ...input, from: new Date(s - 1), to: new Date(s + input.durationMinutes * 60_000 + 1) })
    .some((d) => d.getTime() === s);
}

export function groupSlotsByLocalDay(slots: Date[], viewerTz: string): Array<{ date: string; slots: Date[] }> {
  const m = new Map<string, Date[]>();
  for (const s of slots) {
    const k = DateTime.fromJSDate(s, { zone: viewerTz }).toISODate()!;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(s);
  }
  return [...m.entries()].map(([date, slots]) => ({ date, slots }));
}

