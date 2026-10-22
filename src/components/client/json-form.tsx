"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { Alert, Button, inputClass } from "@/components/ui";

export type Field = {
  name: string; label: string; type?: "text" | "textarea" | "number" | "select" | "checkbox" | "datetime" | "email";
  options?: Array<{ value: string; label: string }>; required?: boolean; defaultValue?: string | number | boolean; placeholder?: string; min?: number; max?: number; rows?: number;
};

/** Generic accessible form that POSTs JSON; shows server validation errors inline; refreshes or redirects on success. */
export function JsonForm({ endpoint, fields, submitLabel, extra, successText, resetOnSuccess = true, method = "POST", testId }: {
  endpoint: string; fields: Field[]; submitLabel: string; extra?: Record<string, unknown>; successText?: string; resetOnSuccess?: boolean; method?: string; testId?: string;
}) {
  const router = useRouter();
  const uid = useId();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form data-testid={testId} className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fd = new FormData(form);
      const body: Record<string, unknown> = { ...extra };
      for (const f of fields) {
        const raw = fd.get(f.name);
        if (f.type === "checkbox") body[f.name] = raw === "on";
        else if (f.type === "number") body[f.name] = raw === "" || raw === null ? undefined : Number(raw);
        else if (f.type === "datetime") body[f.name] = raw ? new Date(String(raw)).toISOString() : undefined;
        else body[f.name] = raw === "" ? (f.required ? "" : undefined) : raw;
      }
      setBusy(true); setMsg(null);
      try {
        const r = await api<{ redirect?: string }>(endpoint, { method, body });
        if (successText) setMsg({ ok: true, text: successText });
        if (resetOnSuccess) form.reset();
        if (r?.redirect) router.push(r.redirect);
        router.refresh();
      } catch (err) {
        const details = err instanceof ApiError && Array.isArray(err.details) ? ` (${(err.details as Array<{ path: string; message: string }>).map((d) => `${d.path}: ${d.message}`).join(", ")})` : "";
        setMsg({ ok: false, text: (err instanceof ApiError ? err.message : "Something went wrong") + details });
      } finally { setBusy(false); }
    }}>
      {fields.map((f) => {
        const id = `${uid}-${f.name}`;
        if (f.type === "checkbox") return (
          <label key={f.name} htmlFor={id} className="flex items-center gap-2 text-sm"><input id={id} name={f.name} type="checkbox" defaultChecked={!!f.defaultValue} className="size-4" />{f.label}</label>
        );
        return (
          <div key={f.name}>
            <label htmlFor={id} className="mb-1 block text-sm font-medium">{f.label}{f.required && <span aria-hidden className="text-red-600"> *</span>}</label>
            {f.type === "textarea" ? <textarea id={id} name={f.name} rows={f.rows ?? 4} required={f.required} defaultValue={f.defaultValue as string | undefined} placeholder={f.placeholder} className={inputClass} />
              : f.type === "select" ? <select id={id} name={f.name} required={f.required} defaultValue={f.defaultValue as string | undefined} className={inputClass}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : <input id={id} name={f.name} required={f.required} placeholder={f.placeholder} min={f.min} max={f.max}
                  type={f.type === "datetime" ? "datetime-local" : f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
                  defaultValue={f.defaultValue as string | number | undefined} className={inputClass} />}
          </div>
        );
      })}
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <Button type="submit" disabled={busy}>{busy ? "…" : submitLabel}</Button>
    </form>
  );
}
