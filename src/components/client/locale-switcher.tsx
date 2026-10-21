"use client";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

export function LocaleSwitcher({ current, label }: { current: string; label: string }) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-1 text-sm text-muted">
      <Globe aria-hidden className="size-4" />
      <span className="sr-only">{label}</span>
      <select value={current} aria-label={label} className="rounded-md border border-line bg-white px-1.5 py-1 text-sm"
        onChange={async (e) => {
          await fetch("/api/locale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: e.target.value }) });
          router.refresh();
        }}>
        <option value="en">English</option>
        <option value="fr">Français</option>
        <option value="ar">العربية</option>
      </select>
    </label>
  );
}
