"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { forgotSchema, loginSchema, passwordSchema, signupSchema } from "@/lib/validation/auth";
import { api, ApiError } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { Alert, Button, FieldError, inputClass, Label } from "@/components/ui";

function useErr() {
  const { t } = useI18n();
  return (m?: string) => (m ? (t.auth.errors as Record<string, string>)[m] ?? m : undefined);
}

export function SignInForm({ next }: { next?: string }) {
  const { t } = useI18n();
  const err = useErr();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(loginSchema) });
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => {
      setServerError(null);
      try { await api("/api/auth/login", { body: v }); router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"); router.refresh(); }
      catch (e) { setServerError(e instanceof ApiError ? e.message : t.common.error); }
    })}>
      {serverError && <Alert tone="error">{serverError}</Alert>}
      <div><Label htmlFor="email">{t.auth.email}</Label><input id="email" type="email" autoComplete="email" className={inputClass} aria-invalid={!!errors.email} aria-describedby="email-err" {...register("email")} /><FieldError id="email-err" message={err(errors.email?.message)} /></div>
      <div><Label htmlFor="password">{t.auth.password}</Label><input id="password" type="password" autoComplete="current-password" className={inputClass} aria-invalid={!!errors.password} aria-describedby="pw-err" {...register("password")} /><FieldError id="pw-err" message={err(errors.password?.message)} /></div>
      <Button type="submit" disabled={isSubmitting} className="w-full">{isSubmitting ? t.common.loading : t.nav.signIn}</Button>
      <div className="flex justify-between text-sm"><Link href="/forgot-password" className="text-brand-700 underline">{t.auth.forgot}</Link><Link href="/signup" className="text-brand-700 underline">{t.nav.joinFree}</Link></div>
    </form>
  );
}

export function SignUpForm({ next }: { next?: string }) {
  const { t, locale } = useI18n();
  const err = useErr();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { timezone: tz, locale, marketingOptIn: false },
  });
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => {
      setServerError(null);
      try { await api("/api/auth/signup", { body: v }); router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"); router.refresh(); }
      catch (e) { setServerError(e instanceof ApiError ? e.message : t.common.error); }
    })}>
      {serverError && <Alert tone="error">{serverError}</Alert>}
      <div><Label htmlFor="displayName">{t.auth.name}</Label><input id="displayName" autoComplete="name" className={inputClass} aria-invalid={!!errors.displayName} {...register("displayName")} /><FieldError message={err(errors.displayName?.message)} /></div>
      <div><Label htmlFor="email">{t.auth.email}</Label><input id="email" type="email" autoComplete="email" className={inputClass} aria-invalid={!!errors.email} {...register("email")} /><FieldError message={err(errors.email?.message)} /></div>
      <div><Label htmlFor="password">{t.auth.password}</Label><input id="password" type="password" autoComplete="new-password" className={inputClass} aria-invalid={!!errors.password} aria-describedby="pw-hint" {...register("password")} /><p id="pw-hint" className="mt-1 text-xs text-muted">{t.auth.passwordHint}</p><FieldError message={err(errors.password?.message)} /></div>
      <input type="hidden" {...register("timezone")} /><input type="hidden" {...register("locale")} />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" {...register("acceptTerms")} /><span>{t.auth.terms} (<Link href="/legal/terms" className="underline">terms</Link>, <Link href="/legal/privacy" className="underline">privacy</Link>)</span></label>
      <FieldError message={err(errors.acceptTerms?.message)} />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" {...register("confirmAdult")} /><span>{t.auth.adult}</span></label>
      <FieldError message={err(errors.confirmAdult?.message)} />
      <label className="flex items-start gap-2 text-sm text-muted"><input type="checkbox" className="mt-1" {...register("marketingOptIn")} /><span>{t.auth.marketing}</span></label>
      <Button type="submit" disabled={isSubmitting} className="w-full">{isSubmitting ? t.common.loading : t.nav.joinFree}</Button>
      <p className="text-center text-sm">{t.auth.haveAccount} <Link href="/signin" className="text-brand-700 underline">{t.nav.signIn}</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const { t } = useI18n();
  const err = useErr();
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(forgotSchema) });
  if (done) return <Alert tone="success">{t.auth.forgotSent}</Alert>;
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => {
      try { await api("/api/auth/forgot", { body: v }); setDone(true); } catch (e) { setServerError(e instanceof ApiError ? e.message : t.common.error); }
    })}>
      {serverError && <Alert tone="error">{serverError}</Alert>}
      <div><Label htmlFor="email">{t.auth.email}</Label><input id="email" type="email" className={inputClass} {...register("email")} /><FieldError message={err(errors.email?.message)} /></div>
      <Button type="submit" disabled={isSubmitting} className="w-full">{t.auth.sendLink}</Button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const { t } = useI18n();
  const err = useErr();
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(z.object({ password: passwordSchema })) });
  if (done) return <Alert tone="success">{t.auth.resetDone} <Link className="underline" href="/signin">{t.nav.signIn}</Link></Alert>;
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => {
      try { await api("/api/auth/reset", { body: { token, password: v.password } }); setDone(true); } catch (e) { setServerError(e instanceof ApiError ? e.message : t.common.error); }
    })}>
      {serverError && <Alert tone="error">{serverError}</Alert>}
      <div><Label htmlFor="password">{t.auth.newPassword}</Label><input id="password" type="password" autoComplete="new-password" className={inputClass} {...register("password")} /><FieldError message={err(errors.password?.message)} /></div>
      <Button type="submit" disabled={isSubmitting} className="w-full">{t.common.save}</Button>
    </form>
  );
}

export function VerifyEmailButton({ token }: { token: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "ok" | "fail" | "busy">("idle");
  if (state === "ok") return <Alert tone="success">{t.auth.verifyOk} <Link className="underline" href="/dashboard">{t.nav.overview}</Link></Alert>;
  if (state === "fail") return <Alert tone="error">{t.auth.verifyFail}</Alert>;
  return <Button disabled={state === "busy"} onClick={async () => { setState("busy"); try { await api("/api/auth/verify", { body: { token } }); setState("ok"); } catch { setState("fail"); } }}>{t.common.submit}</Button>;
}
