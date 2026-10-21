"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

export type MapMarker = { id: string; slug: string; name: string; lat: number; lng: number; price: string; isDemo: boolean };

/**
 * Leaflet + OpenStreetMap tiles (keyless; attribution shown). Markers come only from approximate public
 * positions returned by the server. Clicking a marker shows a summary and highlights the list card.
 */
export function TeacherMap({ markers, labels }: { markers: MapMarker[]; labels: { searchArea: string; hint: string; demo: string } }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const router = useRouter();
  const params = useSearchParams();
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      (window as unknown as { L: typeof L }).L = L;
      await import("leaflet.markercluster");
      if (cancelled || !ref.current) return;
      mapRef.current?.remove();
      const map = L.map(ref.current, { scrollWheelZoom: false });
      mapRef.current = map;
      L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18, attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const cluster = (L as unknown as { markerClusterGroup: () => import("leaflet").LayerGroup }).markerClusterGroup();
      const icon = L.divIcon({ className: "", html: '<span style="display:block;width:22px;height:22px;border-radius:50%;background:#0b7f75;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>', iconSize: [22, 22] });
      for (const m of markers) {
        const mk = L.marker([m.lat, m.lng], { icon, title: m.name, keyboard: true });
        const div = document.createElement("div");
        const a = document.createElement("a");
        a.href = `/teachers/${m.slug}`; a.textContent = m.name; a.style.fontWeight = "600";
        div.append(a, document.createElement("br"), document.createTextNode(m.price + (m.isDemo ? ` · ${labels.demo}` : "")));
        mk.bindPopup(div);
        mk.on("click", () => {
          const card = document.getElementById(`teacher-${m.id}`);
          document.querySelectorAll("[data-teacher-id]").forEach((el) => el.classList.remove("ring-2", "ring-brand-500"));
          card?.classList.add("ring-2", "ring-brand-500");
          card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        cluster.addLayer(mk);
      }
      map.addLayer(cluster);
      if (markers.length) map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number])).pad(0.3), { maxZoom: 12 });
      else map.setView([30, 10], 3);
      map.on("moveend", () => setMoved(true));
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [markers, labels.demo]);

  return (
    <div className="relative">
      <div ref={ref} className="h-[420px] w-full rounded-xl border border-line md:h-[560px]" role="region" aria-label="Map of teachers (approximate areas)" />
      <p className="mt-1 text-xs text-muted">{labels.hint}</p>
      {moved && (
        <button type="button" className="absolute start-1/2 top-3 z-[1000] -translate-x-1/2 rounded-full bg-white px-4 py-1.5 text-sm font-medium shadow" onClick={() => {
          const b = mapRef.current!.getBounds();
          const sp = new URLSearchParams(params.toString());
          sp.set("bbox", [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(4)).join(","));
          sp.delete("page");
          router.push(`/teachers?${sp.toString()}`);
        }}>{labels.searchArea}</button>
      )}
    </div>
  );
}
