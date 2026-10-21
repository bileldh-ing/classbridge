/** Small accessible component kit (shadcn-style, Tailwind). Server-safe (no hooks). */
import Link from "next/link";
import { cn } from "@/lib/cn";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const btnBase = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-10";
const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "border border-line bg-white text-ink hover:bg-canvas",
  ghost: "text-ink hover:bg-canvas",
  danger: "bg-red-600 text-white hover:bg-red-700",
};
export function buttonClass(variant: BtnVariant = "primary", className?: string) { return cn(btnBase, btnVariants[variant], className); }
export function Button({ variant = "primary", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return <button className={buttonClass(variant, className)} {...p} />;
}
export function LinkButton({ variant = "primary", className, ...p }: React.ComponentProps<typeof Link> & { variant?: BtnVariant }) {
  return <Link className={buttonClass(variant, className)} {...p} />;
}

export const inputClass = "block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-brand-500 min-h-10 aria-[invalid=true]:border-red-500";
export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-sm font-medium text-ink", className)} {...p} />;
}
export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return <p id={id} role="alert" className="mt-1 text-sm text-red-700">{message}</p>;
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-white p-5", className)} {...p} />;
}

export function Badge({ tone = "neutral", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "brand" | "warn" | "danger" | "success" | "demo" }) {
  const tones = {
    neutral: "bg-canvas text-muted border-line", brand: "bg-brand-50 text-brand-700 border-brand-100",
    warn: "bg-amber-50 text-amber-800 border-amber-200", danger: "bg-red-50 text-red-700 border-red-200",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200", demo: "bg-violet-50 text-violet-700 border-violet-200",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...p} />;
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "error" | "success"; title?: string; children?: React.ReactNode; className?: string }) {
  const map = {
    info: ["border-sky-200 bg-sky-50 text-sky-900", Info], warn: ["border-amber-200 bg-amber-50 text-amber-900", AlertTriangle],
    error: ["border-red-200 bg-red-50 text-red-900", XCircle], success: ["border-emerald-200 bg-emerald-50 text-emerald-900", CheckCircle2],
  } as const;
  const [cls, Icon] = map[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-3 text-sm", cls, className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>{title && <p className="font-semibold">{title}</p>}{children}</div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-canvas px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {body && <p className="mt-1 text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-line/70", className)} />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>
      {actions}
    </div>
  );
}

export function Avatar({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700" style={{ width: size, height: size, fontSize: size / 2.6 }}>{initials}</span>;
}

export function DemoBadge({ label }: { label: string }) {
  return <Badge tone="demo" title="Demo data">{label}</Badge>;
}

const statusTone: Record<string, "neutral" | "brand" | "warn" | "danger" | "success"> = {
  confirmed: "success", in_progress: "brand", completed: "success", slot_held: "warn", awaiting_payment: "warn", refund_pending: "warn",
  expired: "neutral", canceled_by_student: "neutral", canceled_by_teacher: "neutral", payment_failed: "danger", no_show_student: "danger",
  no_show_teacher: "danger", refunded: "neutral", disputed: "danger", draft: "neutral",
};
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge tone={statusTone[status] ?? "neutral"}>{label}</Badge>;
}
