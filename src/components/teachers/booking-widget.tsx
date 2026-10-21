"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { api, ApiError } from "@/lib/client/api";
import { Alert, Button, buttonClass, Skeleton } from "@/components/ui";

type Offering = { id: string; title: string; description: string; durationMinutes: number; priceLabel: string; mode: string; type: string };
const DAY = 86_400_000;

export function BookingWidget({ offerings, signedIn, viewerTz, slug, isOwn }: { offerings: Offering[]; signedIn: boolean; viewerTz: string; slug: string; isOwn: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [offeringId, setOfferingId] = useState(offerings[0]?.id);
  const [weekStart, setWeekStart] = useState(() => Date.now());
  const [slots, setSlots] = useState<number[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [idemKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`));
  const intl = locale === "ar" ? "ar-TN" : locale === "fr" ? "fr-FR" : "en-GB";

  useEffect(() => {
    if (!offeringId) return;
    let alive = true;
    setSlots(null); setLoadErr(null); setPicked(null);
    api<{ slots: number[] }>(`/api/availability?offeringId=${offeringId}&from=${new Date(weekStart).toISOString()}&to=${new Date(weekStart + 7 * DAY).toISOString()}`)
      .then((r) => alive && setSlots(r.slots))
      .catch((e) => alive && setLoadErr(e instanceof ApiError ? e.message : t.common.error));
    return () => { alive = false; };
  }, [offeringId, weekStart, t.common.error]);

  const days = useMemo(() => {
    const m = new Map<string, number[]>();
    const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz, year: "numeric", month: "2-digit", day: "2-digit" });
    for (const s of slots ?? []) { const k = keyFmt.format(new Date(s)); if (!m.has(k)) m.set(k, []); m.get(k)!.push(s); }
    return [...m.entries()];
  }, [slots, viewerTz]);

  if (!offerings.length) return <Alert tone="info">{t.booking.noSlots}</Alert>;
  const offering = offerings.find((o) => o.id === offeringId)!;

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t.booking.chooseLesson}</legend>
        <div className="space-y-2">
          {offerings.map((o) => (
            <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${o.id === offeringId ? "border-brand-500 bg-brand-50" : "border-line"}`}>
              <input type="radio" name="offering" className="mt-1" checked={o.id === offeringId} onChange={() => setOfferingId(o.id)} />
              <span className="flex-1"><span className="block text-sm font-medium">{o.title}</span>
                <span className="block text-xs text-muted">{o.durationMinutes} {t.common.minutes} · {o.mode === "online" ? t.common.online : t.common.inPerson}</span></span>
              <span className="text-sm font-semibold">{o.priceLabel}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">{t.booking.chooseTime}</p>
          <div className="flex gap-1">
            <button type="button" aria-label={t.booking.weekPrev} disabled={weekStart <= Date.now()} className={buttonClass("ghost", "px-2")} onClick={() => setWeekStart((w) => Math.max(Date.now(), w - 7 * DAY))}><ChevronLeft className="size-4 rtl-flip" aria-hidden /></button>
            <button type="button" aria-label={t.booking.weekNext} className={buttonClass("ghost", "px-2")} onClick={() => setWeekStart((w) => w + 7 * DAY)}><ChevronRight className="size-4 rtl-flip" aria-hidden /></button>
          </div>
        </div>
        <p className="mb-2 text-xs text-muted">{t.teacher.timezoneNote.replace("{tz}", viewerTz)}</p>
        {loadErr && <Alert tone="error">{loadErr}</Alert>}
        {!slots && !loadErr && <div aria-busy="true"><span className="sr-only">{t.booking.loadingSlots}</span><Skeleton className="h-24" /></div>}
        {slots && slots.length === 0 && <p className="rounded-lg bg-canvas p-3 text-sm text-muted">{t.booking.noSlots}</p>}
        <div className="max-h-72 space-y-3 overflow-y-auto">
          {days.map(([day, list]) => (
            <div key={day}>
              <p className="mb-1 text-xs font-medium text-muted">{new Intl.DateTimeFormat(intl, { timeZone: viewerTz, weekday: "long", day: "numeric", month: "long" }).format(new Date(list[0]))}</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={day}>
                {list.map((s) => (
                  <button key={s} type="button" aria-pressed={picked === s} onClick={() => setPicked(s)}
                    className={`rounded-md border px-2.5 py-1 text-sm ${picked === s ? "border-brand-600 bg-brand-600 text-white" : "border-line hover:border-brand-500"}`}>
                    {new Intl.DateTimeFormat(intl, { timeZone: viewerTz, hour: "2-digit", minute: "2-digit" }).format(new Date(s))}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {err && <Alert tone="error">{err}</Alert>}
      {isOwn ? null : !signedIn ? (
        <Link className={buttonClass("primary", "w-full")} href={`/signin?next=/teachers/${slug}`}>{t.booking.signInToBook}</Link>
      ) : (
        <Button className="w-full" disabled={!picked || busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const r = await api<{ id: string }>("/api/bookings", { body: { offeringId: offering.id, startsAt: new Date(picked!).toISOString(), timezone: viewerTz, idempotencyKey: `${idemKey}-${picked}` } });
            router.push(`/lessons/${r.id}/checkout`);
          } catch (e) {
            setErr(e instanceof ApiError && e.code === "SLOT_UNAVAILABLE" ? t.booking.slotTaken : e instanceof ApiError ? e.message : t.common.error);
            setWeekStart((w) => w + 0.001); // refetch slots
            setBusy(false);
          }
        }}>{busy ? t.booking.holding : t.booking.continue}</Button>
      )}
    </div>
  );
}
