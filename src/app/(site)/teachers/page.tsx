import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages";
import { parseTeacherSearch, serializeTeacherSearch, LEVELS, LANGUAGES, type TeacherSearch } from "@/lib/validation/search";
import { searchTeachers } from "@/lib/services/teacher-search";
import { listCities, listSubjects, nextAvailableSlots, subjectName } from "@/lib/services/catalog";
import { TeacherCardView } from "@/components/teachers/teacher-card";
import { TeacherMap } from "@/components/teachers/teacher-map";
import { UseMyLocation } from "@/components/teachers/use-location";
import { Alert, buttonClass, EmptyState, inputClass, Label } from "@/components/ui";
import { formatMoney, SUPPORTED_CURRENCIES } from "@/lib/money";
import { currentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Find a teacher", alternates: { canonical: "/teachers" } };

type SP = Record<string, string | string[] | undefined>;

export default async function TeachersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const raw = await searchParams;
  const { t, locale } = await getI18n();
  const db = getDb();
  const user = await currentUser();
  const viewerTz = user?.timezone ?? "UTC";
  const [subjects, cities] = await Promise.all([listSubjects(db), listCities(db)]);
  const parsed = parseTeacherSearch(raw);
  const view = raw.view === "map" ? "map" : "list";
  let s: TeacherSearch | null = parsed.success ? parsed.data : null;
  // "Near city" uses the city's centre from the seeded city list for radius search.
  if (s?.city && s.radiusKm) {
    const c = cities.find((x) => x.name.toLowerCase() === s!.city!.toLowerCase());
    if (c) s = { ...s, lat: c.lat, lng: c.lng, city: undefined };
  }
  const result = s ? await searchTeachers(db, s, locale) : null;
  const next = result ? await nextAvailableSlots(db, result.items.map((i) => i.id)) : new Map();
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const qs = (patch: Record<string, string | number | undefined>) => {
    const base = parsed.success ? { ...parsed.data } : {};
    const merged: Record<string, unknown> = { ...base, ...patch };
    const str = serializeTeacherSearch(merged as Partial<TeacherSearch>);
    const v = (patch.view as string | undefined) ?? view;
    return `/teachers?${str}${v === "map" ? `${str ? "&" : ""}view=map` : ""}`;
  };
  const v = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  const markers = (result?.items ?? []).filter((i) => i.position).map((i) => ({
    id: i.id, slug: i.slug, name: i.displayName, lat: i.position!.lat, lng: i.position!.lng, isDemo: i.isDemo,
    price: i.hourlyRateMinor === 0 ? t.common.free : `${formatMoney(i.hourlyRateMinor, i.currency, locale)} ${t.common.perHour}`,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">{t.search.title}</h1>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <form method="get" action="/teachers" className="space-y-4 rounded-xl border border-line p-4" aria-label={t.search.title}>
          <div><Label htmlFor="q">{t.common.search}</Label><input id="q" name="q" defaultValue={v("q")} className={inputClass} placeholder={t.home.searchPlaceholder} /></div>
          <div><Label htmlFor="subject">{t.search.subject}</Label>
            <select id="subject" name="subject" defaultValue={v("subject")} className={inputClass}><option value="">{t.search.anySubject}</option>
              {subjects.map((x) => <option key={x.id} value={x.slug}>{subjectName(x, locale)}</option>)}</select></div>
          <div><Label htmlFor="level">{t.search.level}</Label>
            <select id="level" name="level" defaultValue={v("level")} className={inputClass}><option value="">{t.search.anyLevel}</option>
              {LEVELS.map((l) => <option key={l} value={l}>{t.search.levels[l]}</option>)}</select></div>
          <div><Label htmlFor="language">{t.search.language}</Label>
            <select id="language" name="language" defaultValue={v("language")} className={inputClass}><option value="">{t.search.anyLanguage}</option>
              {LANGUAGES.map((l) => <option key={l} value={l}>{t.search.languages[l]}</option>)}</select></div>
          <div><Label htmlFor="mode">{t.search.format}</Label>
            <select id="mode" name="mode" defaultValue={v("mode")} className={inputClass}><option value="">{t.search.anyFormat}</option>
              <option value="online">{t.common.online}</option><option value="in_person">{t.common.inPerson}</option></select></div>
          <fieldset className="grid grid-cols-3 gap-2"><legend className="mb-1 text-sm font-medium">{t.search.priceMin} / {t.search.priceMax}</legend>
            <input aria-label={t.search.priceMin} name="minPrice" inputMode="decimal" defaultValue={v("minPrice")} className={inputClass} placeholder="0" />
            <input aria-label={t.search.priceMax} name="maxPrice" inputMode="decimal" defaultValue={v("maxPrice")} className={inputClass} placeholder="100" />
            <select aria-label={t.search.currency} name="currency" defaultValue={v("currency") || "EUR"} className={inputClass}>{SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="city">{t.search.nearCity}</Label>
              <select id="city" name="city" defaultValue={v("city")} className={inputClass}><option value="">—</option>{cities.map((c) => <option key={c.id} value={c.name}>{c.name} ({c.country})</option>)}</select></div>
            <div><Label htmlFor="radiusKm">{t.search.radius}</Label><input id="radiusKm" name="radiusKm" inputMode="numeric" defaultValue={v("radiusKm")} className={inputClass} placeholder="25" /></div>
          </div>
          <UseMyLocation label={t.search.useMyLocation} denied={t.search.locationDenied} explain={t.search.locationExplain} />
          {v("lat") && <><input type="hidden" name="lat" value={v("lat")} /><input type="hidden" name="lng" value={v("lng")} /></>}
          <div><Label htmlFor="minRating">{t.search.minRating}</Label>
            <select id="minRating" name="minRating" defaultValue={v("minRating")} className={inputClass}><option value="">—</option>{[3, 4, 4.5].map((r) => <option key={r} value={r}>{r}★+</option>)}</select></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" value="true" defaultChecked={v("verified") === "true"} />{t.search.verifiedOnly}</label>
          <div><Label htmlFor="sort">{t.search.sort}</Label>
            <select id="sort" name="sort" defaultValue={v("sort") || "relevance"} className={inputClass}>
              <option value="relevance">{t.search.sortRelevance}</option><option value="price_asc">{t.search.sortPriceAsc}</option><option value="price_desc">{t.search.sortPriceDesc}</option><option value="rating">{t.search.sortRating}</option><option value="newest">{t.search.sortNewest}</option>
            </select></div>
          {view === "map" && <input type="hidden" name="view" value="map" />}
          <div className="flex gap-2"><button className={buttonClass("primary", "flex-1")}>{t.search.apply}</button><Link href="/teachers" className={buttonClass("secondary")}>{t.search.reset}</Link></div>
        </form>

        <section aria-live="polite">
          {!parsed.success && <Alert tone="error" title={t.common.error}>{parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}</Alert>}
          {result && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted">{fmt(t.search.results, { count: result.total })}</p>
                <div role="tablist" aria-label="View" className="inline-flex rounded-lg border border-line p-0.5">
                  <Link role="tab" aria-selected={view === "list"} href={qs({ view: "list" })} className={`rounded-md px-3 py-1 text-sm ${view === "list" ? "bg-brand-600 text-white" : ""}`}>{t.search.list}</Link>
                  <Link role="tab" aria-selected={view === "map"} href={qs({ view: "map" })} className={`rounded-md px-3 py-1 text-sm ${view === "map" ? "bg-brand-600 text-white" : ""}`}>{t.search.map}</Link>
                </div>
              </div>
              {view === "map" && (
                <div className="mb-4">
                  {markers.length === 0 && result.total > 0 && <Alert tone="info" className="mb-2">{t.search.mapNoPositions}</Alert>}
                  <TeacherMap markers={markers} labels={{ searchArea: locale === "fr" ? "Rechercher dans cette zone" : locale === "ar" ? "ابحث في هذه المنطقة" : "Search this area", hint: t.search.mapHint, demo: t.common.demo }} />
                </div>
              )}
              {result.items.length === 0 ? (
                <EmptyState title={t.search.noResults} body={t.search.noResultsHint} action={<Link href="/teachers" className={buttonClass("secondary")}>{t.search.reset}</Link>} />
              ) : (
                <div className="space-y-3">{result.items.map((c) => <TeacherCardView key={c.id} c={c} t={t} locale={locale} nextSlot={next.get(c.id)} viewerTz={viewerTz} />)}</div>
              )}
              {totalPages > 1 && (
                <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-sm">
                  {result.page > 1 ? <Link className={buttonClass("secondary")} href={qs({ page: result.page - 1 })}>{t.common.previous}</Link> : <span />}
                  <span>{t.common.page} {result.page} {t.common.of} {totalPages}</span>
                  {result.page < totalPages ? <Link className={buttonClass("secondary")} href={qs({ page: result.page + 1 })}>{t.common.next}</Link> : <span />}
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
