"use client";
import { useRouter } from "next/navigation";

export function RoleSwitcher({ current, options, label }: { current: string; options: Array<{ value: string; label: string; href: string }>; label: string }) {
  const router = useRouter();
  if (options.length < 2) return null;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <select className="rounded-md border border-line bg-white px-2 py-1" value={current} onChange={async (e) => {
        const opt = options.find((o) => o.value === e.target.value)!;
        await fetch("/api/auth/role", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: opt.value }) });
        router.push(opt.href);
        router.refresh();
      }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
