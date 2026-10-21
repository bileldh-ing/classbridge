"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { buttonClass } from "@/components/ui";

/** POSTs JSON to an API route, shows inline error/success, refreshes server data. */
export function ActionButton({ endpoint, body, label, pendingLabel, variant = "primary", confirmText, successText, redirectTo, method = "POST", className }: {
  endpoint: string; body?: unknown; label: string; pendingLabel?: string; variant?: "primary" | "secondary" | "ghost" | "danger";
  confirmText?: string; successText?: string; redirectTo?: string; method?: string; className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" disabled={pending} className={buttonClass(variant, className)} onClick={() => {
        if (confirmText && !window.confirm(confirmText)) return;
        setMsg(null);
        start(async () => {
          try {
            const r = await api<{ redirect?: string; url?: string }>(endpoint, { method, body: body ?? {} });
            if (r?.url) { window.location.assign(r.url); return; }
            if (successText) setMsg({ ok: true, text: successText });
            if (redirectTo || r?.redirect) router.push((redirectTo ?? r.redirect)!);
            router.refresh();
          } catch (e) {
            setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Something went wrong" });
          }
        });
      }}>{pending ? pendingLabel ?? "…" : label}</button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-700"}>{msg.text}</span>}
    </span>
  );
}
