"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LocateFixed } from "lucide-react";

/** Optional geolocation (never required). Coordinates are only used in the URL for this search. */
export function UseMyLocation({ label, denied, explain }: { label: string; denied: string; explain: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button type="button" className="inline-flex items-center gap-1 text-sm text-brand-700 underline" onClick={() => {
        if (!navigator.geolocation) { setErr(denied); return; }
        navigator.geolocation.getCurrentPosition((pos) => {
          const sp = new URLSearchParams(params.toString());
          sp.set("lat", pos.coords.latitude.toFixed(3)); sp.set("lng", pos.coords.longitude.toFixed(3));
          if (!sp.get("radiusKm")) sp.set("radiusKm", "25");
          sp.delete("page"); sp.delete("city");
          router.push(`/teachers?${sp.toString()}`);
        }, () => setErr(denied), { maximumAge: 600_000, timeout: 10_000 });
      }}><LocateFixed aria-hidden className="size-4" />{label}</button>
      <p className="mt-1 text-xs text-muted">{explain}</p>
      {err && <p role="alert" className="mt-1 text-xs text-red-700">{err}</p>}
    </div>
  );
}
