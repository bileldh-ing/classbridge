"use client";
import { useState } from "react";
import { Flag } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { Button, inputClass, Label } from "@/components/ui";

export function ReportButton({ targetType, targetId, label, sentLabel }: { targetType: string; targetId: string; label: string; sentLabel: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("inappropriate");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sent" | string>("idle");
  if (state === "sent") return <p role="status" className="text-sm text-emerald-700">{sentLabel}</p>;
  return (
    <div>
      <button type="button" className="inline-flex items-center gap-1 text-sm text-muted underline" aria-expanded={open} onClick={() => setOpen(!open)}><Flag aria-hidden className="size-3.5" />{label}</button>
      {open && (
        <form className="mt-2 space-y-2 rounded-lg border border-line p-3" onSubmit={async (e) => {
          e.preventDefault();
          try { await api("/api/reports", { body: { targetType, targetId, reason, details: details || undefined } }); setState("sent"); }
          catch (err) { setState(err instanceof ApiError ? err.message : "Error"); }
        }}>
          <Label htmlFor={`r-${targetId}`}>{label}</Label>
          <select id={`r-${targetId}`} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>
            {["spam", "harassment", "inappropriate", "fraud", "safety", "other"].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <textarea aria-label="Details" maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} className={inputClass} rows={3} />
          {state !== "idle" && <p role="alert" className="text-sm text-red-700">{state}</p>}
          <Button type="submit" variant="secondary">Submit</Button>
        </form>
      )}
    </div>
  );
}
