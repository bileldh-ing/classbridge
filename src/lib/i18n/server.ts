import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getMessages, isRtl, LOCALES, type Locale } from "./messages";

export const LOCALE_COOKIE = "cb_locale";

/** Locale resolution: explicit cookie → Accept-Language → en. */
export const getLocale = cache(async (): Promise<Locale> => {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (c && (LOCALES as readonly string[]).includes(c)) return c as Locale;
  const al = (await headers()).get("accept-language") ?? "";
  for (const part of al.split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if ((LOCALES as readonly string[]).includes(code)) return code as Locale;
  }
  return "en";
});

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: getMessages(locale), dir: isRtl(locale) ? ("rtl" as const) : ("ltr" as const) };
}
