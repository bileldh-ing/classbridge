"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, ApiError } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { Alert, Button, FieldError, inputClass, Label } from "@/components/ui";
import { LEVELS, LANGUAGES } from "@/lib/validation/search";
import { SUPPORTED_CURRENCIES, parseMajorToMinor, minorToMajorString } from "@/lib/money";

type Msg = { ok: boolean; text: string } | null;
function Status({ msg }: { msg: Msg }) { return msg ? <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert> : null; }
const errText = (e: unknown) => (e instanceof ApiError ? (e.details && Array.isArray(e.details) ? `${e.message}: ${(e.details as Array<{ path?: string; message: string }>).map((d) => `${d.path ?? ""} ${d.message}`).join("; ")}` : e.details ? `${e.message} ${JSON.stringify(e.details)}` : e.message) : "Something went wrong");

const ZONES = typeof Intl !== "undefined" && "supportedValuesOf" in Intl ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone") : ["UTC"];

const profileForm = z.object({
  headline: z.string().trim().min(10, "At least 10 characters").max(120),
  bio: z.string().trim().min(80, "At least 80 characters").max(4000),
  teachingApproach: z.string().max(2000),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  languages: z.array(z.string()).min(1, "Choose at least one language"),
  levels: z.array(z.string()).min(1, "Choose at least one level"),
  subjectIds: z.array(z.string()).min(1, "Choose at least one subject").max(8),
  timezone: z.string().min(1),
  hourlyRate: z.string().min(1, "Required"),
  currency: z.string(),
  offersOnline: z.boolean(),
  offersInPerson: z.boolean(),
  introVideoUrl: z.string().max(300),
  cancellationPolicy: z.string(),
});

export function TeacherProfileForm({ initial, subjects }: {
  initial: { headline: string; bio: string; teachingApproach: string; yearsExperience: number; languages: string[]; levels: string[]; subjectIds: string[]; timezone: string; hourlyRateMinor: number; currency: string; offersOnline: boolean; offersInPerson: boolean; introVideoUrl: string | null; cancellationPolicy: string };
  subjects: Array<{ id: string; name: string }>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(profileForm),
    defaultValues: { ...initial, introVideoUrl: initial.introVideoUrl ?? "", hourlyRate: minorToMajorString(initial.hourlyRateMinor, initial.currency) },
  });
  const multi = (name: "languages" | "levels" | "subjectIds", options: Array<{ v: string; l: string }>, legend: string) => (
    <fieldset><legend className="mb-1 text-sm font-medium">{legend}</legend>
      <Controller control={control} name={name} render={({ field }) => (
        <div className="flex flex-wrap gap-2">{options.map((o) => {
          const on = field.value.includes(o.v);
          return <label key={o.v} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${on ? "border-brand-600 bg-brand-50" : "border-line"}`}>
            <input type="checkbox" className="sr-only" checked={on} onChange={() => field.onChange(on ? field.value.filter((x: string) => x !== o.v) : [...field.value, o.v])} />{o.l}</label>;
        })}</div>)} />
      <FieldError message={errors[name]?.message as string | undefined} />
    </fieldset>
  );
  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit(async (v) => {
      setMsg(null);
      try {
        const hourlyRateMinor = parseMajorToMinor(v.hourlyRate, v.currency);
        await api("/api/teachers/me", { method: "PUT", body: { ...v, hourlyRate: undefined, hourlyRateMinor } });
        setMsg({ ok: true, text: t.common.saved }); router.refresh();
      } catch (e) { setMsg({ ok: false, text: e instanceof Error && !(e instanceof ApiError) ? e.message : errText(e) }); }
    })}>
      <div><Label htmlFor="headline">Headline</Label><input id="headline" className={inputClass} {...register("headline")} aria-invalid={!!errors.headline} /><FieldError message={errors.headline?.message} /></div>
      <div><Label htmlFor="bio">Biography</Label><textarea id="bio" rows={6} className={inputClass} {...register("bio")} aria-invalid={!!errors.bio} /><FieldError message={errors.bio?.message} /></div>
      <div><Label htmlFor="approach">{t.teacher.approach} <span className="text-muted">({t.common.optional})</span></Label><textarea id="approach" rows={3} className={inputClass} {...register("teachingApproach")} /></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><Label htmlFor="years">Years of experience</Label><input id="years" type="number" min={0} max={60} className={inputClass} {...register("yearsExperience")} /></div>
        <div><Label htmlFor="rate">Hourly rate (display)</Label><input id="rate" inputMode="decimal" className={inputClass} {...register("hourlyRate")} /><FieldError message={errors.hourlyRate?.message} /></div>
        <div><Label htmlFor="cur">{t.search.currency}</Label><select id="cur" className={inputClass} {...register("currency")}>{SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
      </div>
      {multi("subjectIds", subjects.map((s) => ({ v: s.id, l: s.name })), t.teacher.subjects)}
      {multi("languages", LANGUAGES.map((l) => ({ v: l, l: t.search.languages[l] })), t.teacher.languages)}
      {multi("levels", LEVELS.map((l) => ({ v: l, l: t.search.levels[l] })), t.teacher.levels)}
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("offersOnline")} />{t.common.online}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("offersInPerson")} />{t.common.inPerson}</label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="tz">{t.settings.timezone}</Label><select id="tz" className={inputClass} {...register("timezone")}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select></div>
        <div><Label htmlFor="pol">{t.teacher.cancellation}</Label><select id="pol" className={inputClass} {...register("cancellationPolicy")}><option value="flex-24h-v1">Flexible (24 h)</option><option value="moderate-48h-v1">Moderate (48 h)</option></select></div>
      </div>
      <div><Label htmlFor="video">{t.teacher.introVideo} (https, {t.common.optional})</Label><input id="video" type="url" className={inputClass} {...register("introVideoUrl")} placeholder="https://" /></div>
      <Status msg={msg} />
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? t.common.saving : t.common.save}</Button>
    </form>
  );
}

export function LocationForm({ cities, current, geocoderAvailable }: {
  cities: Array<{ id: string; name: string; country: string }>; current: { city: string; country: string; visibility: string; source: string } | null; geocoderAvailable: boolean;
}) {
  const router = useRouter();
  const [cityId, setCityId] = useState("");
  const [visibility, setVisibility] = useState(current?.visibility ?? "approximate");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ label: string; lat: number; lng: number; placeId: string; city?: string; country?: string }>>([]);
  const [geo, setGeo] = useState<{ provider: string; permanent: boolean } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [storePrecise, setStorePrecise] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="space-y-4">
      {current && <p className="text-sm">Current: <strong>{current.city}, {current.country}</strong> · {current.visibility} · source: {current.source}</p>}
      <fieldset><legend className="mb-1 text-sm font-medium">Public visibility</legend>
        <div className="space-y-1 text-sm">
          {[["approximate", "Approximate area (~2 km grid) — recommended"], ["public", "Neighbourhood precision (~100 m)"], ["private", "Private — city shown, no map pin"]].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2"><input type="radio" name="vis" checked={visibility === v} onChange={() => setVisibility(v)} />{l}</label>))}
        </div></fieldset>
      <div><Label htmlFor="city-pick">Choose your city (manual, no geocoding provider needed)</Label>
        <div className="flex gap-2"><select id="city-pick" value={cityId} onChange={(e) => setCityId(e.target.value)} className={inputClass}><option value="">—</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.country})</option>)}</select>
          <Button type="button" variant="secondary" disabled={!cityId} onClick={async () => {
            try { await api("/api/teachers/me/location", { method: "PUT", body: { cityId, visibility } }); setMsg({ ok: true, text: "Location saved (city centre used as the public point)." }); router.refresh(); } catch (e) { setMsg({ ok: false, text: errText(e) }); }
          }}>Save city</Button></div></div>
      {geocoderAvailable ? (
        <div className="rounded-lg border border-line p-3">
          <Label htmlFor="geo-q">Or search a neighbourhood / postcode</Label>
          <div className="flex gap-2"><input id="geo-q" value={q} onChange={(e) => setQ(e.target.value)} className={inputClass} />
            <Button type="button" variant="secondary" onClick={async () => {
              setMsg(null);
              try { const r = await api<{ items: typeof results; provider: string; permanent: boolean }>(`/api/geocode?q=${encodeURIComponent(q)}`); setResults(r.items); setGeo({ provider: r.provider, permanent: r.permanent }); if (!r.items.length) setMsg({ ok: false, text: "No results." }); }
              catch (e) { setMsg({ ok: false, text: errText(e) }); }
            }}>Search</Button></div>
          {results.length > 0 && <ul className="mt-2 space-y-1 text-sm">{results.map((r, i) => <li key={r.placeId}><label className="flex items-center gap-2"><input type="radio" name="geo" checked={picked === i} onChange={() => setPicked(i)} />{r.label}</label></li>)}</ul>}
          {geo?.permanent && <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={storePrecise} onChange={(e) => setStorePrecise(e.target.checked)} />Store my precise point privately (used only to match nearby in-person students; never shown publicly)</label>}
          {picked !== null && geo && <Button type="button" className="mt-2" onClick={async () => {
            const r = results[picked];
            try {
              await api("/api/teachers/me/location", { method: "PUT", body: { visibility, storePrecise, geocoded: { label: r.label, lat: r.lat, lng: r.lng, placeId: r.placeId, city: r.city ?? r.label.split(",")[0], country: (r.country ?? "XX").slice(0, 2), provider: geo.provider, permanent: geo.permanent } } });
              setMsg({ ok: true, text: "Location saved." }); router.refresh();
            } catch (e) { setMsg({ ok: false, text: errText(e) }); }
          }}>Save this place</Button>}
          <p className="mt-2 text-xs text-muted">Provider: {geo?.provider ?? "configured"}. Results that the provider marks as temporary are never stored precisely.</p>
        </div>
      ) : <Alert tone="info">No geocoding provider is configured (Mapbox or Nominatim). Use the city list — it is the honest fallback.</Alert>}
      <Status msg={msg} />
    </div>
  );
}

export function BookingSettingsForm({ initial }: { initial: { minNoticeMinutes: number; bufferMinutes: number; maxLessonsPerDay: number; bookingHorizonDays: number } }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const field = (k: keyof typeof v, label: string, max: number) => (
    <div><Label htmlFor={k}>{label}</Label><input id={k} type="number" min={0} max={max} value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} className={inputClass} /></div>
  );
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); try { await api("/api/teachers/me/settings", { method: "PUT", body: v }); setMsg({ ok: true, text: "Saved" }); router.refresh(); } catch (err) { setMsg({ ok: false, text: errText(err) }); } }}>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("minNoticeMinutes", "Minimum notice (minutes)", 20160)}{field("bufferMinutes", "Buffer between lessons (minutes)", 120)}
        {field("maxLessonsPerDay", "Max lessons per day", 16)}{field("bookingHorizonDays", "Bookable up to (days ahead)", 120)}
      </div>
      <Status msg={msg} /><Button type="submit" variant="secondary">Save booking rules</Button>
    </form>
  );
}

export function OfferingForm({ subjects, currency, initial, id }: { subjects: Array<{ id: string; name: string }>; currency: string; id?: string;
  initial?: { title: string; description: string; type: string; subjectId: string | null; durationMinutes: number; priceMinor: number; mode: string; intakeQuestion: string | null; status: string } }) {
  const router = useRouter();
  const [f, setF] = useState({ title: initial?.title ?? "", description: initial?.description ?? "", type: initial?.type ?? "one_to_one", subjectId: initial?.subjectId ?? "", durationMinutes: initial?.durationMinutes ?? 60,
    price: initial ? minorToMajorString(initial.priceMinor, currency) : "", mode: initial?.mode ?? "online", intakeQuestion: initial?.intakeQuestion ?? "", status: initial?.status ?? "published" });
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setMsg(null);
      try {
        const priceMinor = parseMajorToMinor(f.price || "0", currency);
        const body = { ...f, price: undefined, priceMinor, subjectId: f.subjectId || null, intakeQuestion: f.intakeQuestion || null };
        await api(id ? `/api/teachers/me/offerings/${id}` : "/api/teachers/me/offerings", { method: id ? "PUT" : "POST", body });
        setMsg({ ok: true, text: "Saved" }); if (!id) setF({ ...f, title: "", description: "", price: "" }); router.refresh();
      } catch (err) { setMsg({ ok: false, text: err instanceof Error && !(err instanceof ApiError) ? err.message : errText(err) }); }
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor={`t-${id ?? "new"}`}>Title</Label><input id={`t-${id ?? "new"}`} required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputClass} /></div>
        <div><Label htmlFor={`s-${id ?? "new"}`}>{"Subject"}</Label><select id={`s-${id ?? "new"}`} value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })} className={inputClass}><option value="">—</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><Label htmlFor={`ty-${id ?? "new"}`}>Type</Label><select id={`ty-${id ?? "new"}`} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={inputClass}><option value="trial">Trial</option><option value="one_to_one">One-to-one</option></select></div>
        <div><Label htmlFor={`d-${id ?? "new"}`}>Duration</Label><select id={`d-${id ?? "new"}`} value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: Number(e.target.value) })} className={inputClass}>{[30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}</select></div>
        <div><Label htmlFor={`p-${id ?? "new"}`}>Price ({currency}; 0 = free)</Label><input id={`p-${id ?? "new"}`} inputMode="decimal" required value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className={inputClass} /></div>
        <div><Label htmlFor={`m-${id ?? "new"}`}>Mode</Label><select id={`m-${id ?? "new"}`} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} className={inputClass}><option value="online">Online</option><option value="in_person">In person</option></select></div>
        <div><Label htmlFor={`st-${id ?? "new"}`}>Status</Label><select id={`st-${id ?? "new"}`} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={inputClass}><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></div>
        <div><Label htmlFor={`q-${id ?? "new"}`}>Intake question (optional)</Label><input id={`q-${id ?? "new"}`} value={f.intakeQuestion} onChange={(e) => setF({ ...f, intakeQuestion: e.target.value })} className={inputClass} /></div>
      </div>
      <div><Label htmlFor={`de-${id ?? "new"}`}>Description</Label><textarea id={`de-${id ?? "new"}`} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={inputClass} /></div>
      <Status msg={msg} /><Button type="submit" variant={id ? "secondary" : "primary"}>{id ? "Update" : "Add offering"}</Button>
    </form>
  );
}

const DAYS = [["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"], ["7", "Sun"]] as const;
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromHHMM = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

export function AvailabilityEditor({ initial, timezone }: { initial: Array<{ weekday: number; startMinute: number; endMinute: number }>; timezone: string }) {
  const router = useRouter();
  const [rules, setRules] = useState(initial.map((r) => ({ ...r, start: toHHMM(r.startMinute), end: toHHMM(r.endMinute === 1440 ? 1439 : r.endMinute) })));
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Weekly hours in your timezone: <strong>{timezone}</strong>. Daylight-saving changes are handled automatically.</p>
      {DAYS.map(([d, label]) => {
        const day = rules.map((r, i) => ({ r, i })).filter(({ r }) => r.weekday === Number(d));
        return (
          <div key={d} className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
            <span className="w-12 text-sm font-medium">{label}</span>
            {day.length === 0 && <span className="text-sm text-muted">Unavailable</span>}
            {day.map(({ r, i }) => (
              <span key={i} className="flex items-center gap-1">
                <input aria-label={`${label} start`} type="time" value={r.start} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className="rounded border border-line px-1 py-0.5 text-sm" />–
                <input aria-label={`${label} end`} type="time" value={r.end} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className="rounded border border-line px-1 py-0.5 text-sm" />
                <button type="button" aria-label="Remove" className="px-1 text-red-700" onClick={() => setRules(rules.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
            <button type="button" className="text-sm text-brand-700 underline" onClick={() => setRules([...rules, { weekday: Number(d), startMinute: 540, endMinute: 720, start: "09:00", end: "12:00" }])}>+ Add hours</button>
          </div>
        );
      })}
      <Status msg={msg} />
      <Button onClick={async () => {
        try {
          await api("/api/availability", { method: "PUT", body: { rules: rules.map((r) => ({ weekday: r.weekday, startMinute: fromHHMM(r.start), endMinute: r.end === "23:59" ? 1440 : fromHHMM(r.end) })) } });
          setMsg({ ok: true, text: "Availability saved" }); router.refresh();
        } catch (e) { setMsg({ ok: false, text: errText(e) }); }
      }}>Save weekly availability</Button>
    </div>
  );
}

export function ExceptionForm() {
  const router = useRouter();
  const [f, setF] = useState({ kind: "blocked", startsAt: "", endsAt: "", reason: "" });
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <form className="grid gap-2 sm:grid-cols-5" onSubmit={async (e) => {
      e.preventDefault();
      try { await api("/api/availability/exceptions", { body: { ...f, startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString() } }); setMsg({ ok: true, text: "Added" }); router.refresh(); }
      catch (err) { setMsg({ ok: false, text: errText(err) }); }
    }}>
      <select aria-label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={inputClass}><option value="blocked">Time off / blocked</option><option value="extra">Extra availability</option></select>
      <input aria-label="Start" type="datetime-local" required value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} className={inputClass} />
      <input aria-label="End" type="datetime-local" required value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} className={inputClass} />
      <input aria-label="Reason" placeholder="Reason (optional)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className={inputClass} />
      <Button type="submit" variant="secondary">Add</Button>
      <div className="sm:col-span-5"><Status msg={msg} /></div>
    </form>
  );
}

export function CredentialForm() {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg(null);
      const fd = new FormData(e.currentTarget);
      const res = await fetch("/api/teachers/me/credentials", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (res.ok) { setMsg({ ok: true, text: "Submitted for review. No badge is shown until an administrator approves it." }); (e.target as HTMLFormElement).reset(); router.refresh(); }
      else setMsg({ ok: false, text: data?.error?.message ?? "Upload failed" });
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><Label htmlFor="ct">Title</Label><input id="ct" name="title" required minLength={2} className={inputClass} placeholder="MSc Mathematics" /></div>
        <div><Label htmlFor="ci">Issuer</Label><input id="ci" name="issuer" required minLength={2} className={inputClass} placeholder="University…" /></div>
        <div><Label htmlFor="cy">Year</Label><input id="cy" name="issuedYear" type="number" min={1950} max={2100} className={inputClass} /></div>
      </div>
      <div><Label htmlFor="cf">Document (PDF, PNG or JPEG, max 5 MB — stored privately)</Label><input id="cf" name="file" type="file" accept="application/pdf,image/png,image/jpeg" className="text-sm" /></div>
      <Status msg={msg} /><Button type="submit" disabled={busy}>{busy ? "Uploading…" : "Submit credential"}</Button>
    </form>
  );
}
