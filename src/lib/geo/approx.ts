/**
 * Location privacy. Public map positions are derived server-side from the private location:
 * - "approximate": snapped to a fixed ~0.02° grid (≈2 km). Deterministic snapping (not random jitter),
 *   so repeated queries cannot be averaged to recover the true point.
 * - "public": rounded to 3 decimals (≈110 m) — still never a full-precision home address.
 * - "private": no public position at all (excluded from map and radius search).
 */
export type Visibility = "private" | "approximate" | "public";
export const APPROX_GRID_DEG = 0.02;

export function snap(v: number, grid: number) {
  return Math.round((Math.floor(v / grid) * grid + grid / 2) * 1e6) / 1e6;
}

export function publicPosition(lat: number, lng: number, visibility: Visibility): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (visibility === "private") return null;
  if (visibility === "public") return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
  return { lat: snap(lat, APPROX_GRID_DEG), lng: snap(lng, APPROX_GRID_DEG) };
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371.0088, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
