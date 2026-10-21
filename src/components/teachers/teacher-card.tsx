import Link from "next/link";
import { MapPin, Star, Video, Users, CalendarClock } from "lucide-react";
import type { TeacherCard as TC } from "@/lib/services/teacher-search";
import type { Messages, Locale } from "@/lib/i18n/messages";
import { fmt } from "@/lib/i18n/messages";
import { formatMoney } from "@/lib/money";
import { Avatar, Badge, DemoBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/time";

export function TeacherCardView({ c, t, locale, nextSlot, viewerTz }: { c: TC; t: Messages; locale: Locale; nextSlot?: Date | null; viewerTz: string }) {
  return (
    <article id={`teacher-${c.id}`} data-teacher-id={c.id} className="flex gap-4 rounded-xl border border-line bg-white p-4 transition-shadow hover:shadow-sm focus-within:ring-2 focus-within:ring-brand-500">
      <Avatar name={c.displayName} url={c.avatarUrl} size={64} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold"><Link href={`/teachers/${c.slug}`} className="hover:underline">{c.displayName}</Link></h2>
          {c.isDemo && <DemoBadge label={t.common.demo} />}
          {c.badges.map((b) => <Badge key={b} tone="success">{(t.teacher.badges as Record<string, string>)[b] ?? b}</Badge>)}
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted">{c.headline}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{c.subjects.slice(0, 4).map((s) => <Badge key={s} tone="brand">{s}</Badge>)}</div>
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <div className="flex items-center gap-1"><Star aria-hidden className="size-3.5 text-amber-500" /><dt className="sr-only">Rating</dt><dd>{c.ratingCount ? `${c.ratingAvg?.toFixed(1)} · ${fmt(t.search.reviews, { count: c.ratingCount })}` : t.search.noReviews}</dd></div>
          <div className="flex items-center gap-1">{c.offersOnline && <><Video aria-hidden className="size-3.5" /><dd>{t.common.online}</dd></>}{c.offersInPerson && <><Users aria-hidden className="ms-2 size-3.5" /><dd>{t.common.inPerson}</dd></>}</div>
          {c.city && <div className="flex items-center gap-1"><MapPin aria-hidden className="size-3.5" /><dd>{c.city}{c.distanceKm !== null ? ` · ${fmt(t.search.kmAway, { km: c.distanceKm })}` : ""}</dd></div>}
          <div className="flex items-center gap-1"><dt className="sr-only">Languages</dt><dd>{c.languages.map((l) => (t.search.languages as Record<string, string>)[l] ?? l).join(", ")}</dd></div>
          {nextSlot !== undefined && <div className="flex items-center gap-1"><CalendarClock aria-hidden className="size-3.5" /><dd>{nextSlot ? fmtDateTime(nextSlot, viewerTz, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</dd></div>}
        </dl>
      </div>
      <div className="text-end">
        <p className="text-lg font-semibold">{c.hourlyRateMinor === 0 ? t.common.free : formatMoney(c.hourlyRateMinor, c.currency, locale)}</p>
        <p className="text-xs text-muted">{t.common.perHour}</p>
      </div>
    </article>
  );
}
