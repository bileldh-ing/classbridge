"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { Alert, Button, inputClass, Label } from "@/components/ui";

const ZONES = typeof Intl !== "undefined" && "supportedValuesOf" in Intl ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone") : ["UTC"];

export function ProfileForm({ displayName, timezone }: { displayName: string; timezone: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [tz, setTz] = useState(timezone);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      try { await api("/api/profile", { method: "PUT", body: { displayName: name, timezone: tz } }); setMsg({ ok: true, text: t.common.saved }); router.refresh(); }
      catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.message : t.common.error }); }
    }}>
      <div><Label htmlFor="dn">{t.settings.displayName}</Label><input id="dn" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required minLength={2} maxLength={80} /></div>
      <div><Label htmlFor="tz">{t.settings.timezone}</Label><select id="tz" value={tz} onChange={(e) => setTz(e.target.value)} className={inputClass}>{(ZONES.includes(tz) ? ZONES : [tz, ...ZONES]).map((z) => <option key={z}>{z}</option>)}</select></div>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <Button type="submit">{t.common.save}</Button>
    </form>
  );
}

export function PasswordForm() {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      try { await api("/api/auth/password", { body: { current, next } }); setMsg({ ok: true, text: t.common.saved }); setCurrent(""); setNext(""); }
      catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? (err.details ? JSON.stringify(err.details) : err.message) : t.common.error }); }
    }}>
      <div><Label htmlFor="cur">{t.settings.currentPassword}</Label><input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} required /></div>
      <div><Label htmlFor="np">{t.auth.newPassword}</Label><input id="np" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} required minLength={10} /><p className="mt-1 text-xs text-muted">{t.auth.passwordHint}</p></div>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <Button type="submit" variant="secondary">{t.settings.changePassword}</Button>
    </form>
  );
}
