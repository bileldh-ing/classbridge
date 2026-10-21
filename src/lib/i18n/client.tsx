"use client";
import { createContext, useContext } from "react";
import type { Locale, Messages } from "./messages";

const Ctx = createContext<{ locale: Locale; t: Messages } | null>(null);
export function I18nProvider({ locale, t, children }: { locale: Locale; t: Messages; children: React.ReactNode }) {
  return <Ctx.Provider value={{ locale, t }}>{children}</Ctx.Provider>;
}
export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
