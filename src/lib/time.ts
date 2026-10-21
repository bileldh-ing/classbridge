import { DateTime } from "luxon";
import type { Locale } from "./i18n/messages";

const intlLocale = (l: Locale) => (l === "ar" ? "ar-TN" : l === "fr" ? "fr-FR" : "en-GB");

export function fmtDateTime(d: Date | number, tz: string, locale: Locale, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) {
  return new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone: tz }).format(typeof d === "number" ? new Date(d) : d);
}
export function fmtTime(d: Date | number, tz: string, locale: Locale) {
  return fmtDateTime(d, tz, locale, { hour: "2-digit", minute: "2-digit" });
}
export function fmtDay(isoDate: string, tz: string, locale: Locale) {
  const d = DateTime.fromISO(isoDate, { zone: tz }).set({ hour: 12 }).toJSDate();
  return fmtDateTime(d, tz, locale, { weekday: "short", day: "numeric", month: "short" });
}
export function tzLabel(tz: string) { return tz.replace(/_/g, " "); }

/** Calendar file for a booking (RFC 5545). Times in UTC. */
export function buildIcs(e: { uid: string; start: Date; end: Date; title: string; description: string; url: string }) {
  const f = (d: Date) => DateTime.fromJSDate(d, { zone: "utc" }).toFormat("yyyyMMdd'T'HHmmss'Z'");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ClassBridge//Lessons//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${e.uid}@classbridge`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(e.start)}`, `DTEND:${f(e.end)}`,
    `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.description)}`, `URL:${e.url}`, "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}
