"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { Alert, Button, inputClass } from "@/components/ui";

/** Decision form that always requires a written reason (audited server-side). */
export function DecisionForm({ endpoint, options, extra, reasonKey = "reason" }: { endpoint: string; options: Array<{ value: string; label: string; field: string; variant?: "primary" | "danger" | "secondary" }>; extra?: Record<string, unknown>; reasonKey?: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <label className="sr-only" htmlFor={`reason-${endpoint}`}>Reason</label>
      <textarea id={`reason-${endpoint}`} placeholder="Reason (required, min 5 characters — recorded in the audit log)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
      {err && <Alert tone="error">{err}</Alert>}
      <div className="flex flex-wrap gap-2">{options.map((o) => (
        <Button key={o.value} variant={o.variant ?? "secondary"} disabled={busy || reason.trim().length < 5} onClick={async () => {
          if (o.variant === "danger" && !window.confirm(`${o.label}?`)) return;
          setBusy(true); setErr(null);
          try { await api(endpoint, { body: { ...extra, [o.field]: o.value, [reasonKey]: reason } }); setReason(""); router.refresh(); }
          catch (e) { setErr(e instanceof ApiError ? e.message : "Error"); } finally { setBusy(false); }
        }}>{o.label}</Button>))}</div>
    </div>
  );
}
