/**
 * GeocodingProvider adapter. Mapbox (preferred) or Nominatim (only with a contact email, per its policy).
 * When neither is configured, callers fall back to the seeded city list (manual selection).
 * Invalid provider responses are rejected, never turned into made-up coordinates.
 */
import { z } from "zod";
import { env } from "../env";
import { AppError } from "../errors";

export type GeoResult = { label: string; lat: number; lng: number; placeId: string; country?: string; city?: string };

export interface GeocodingProvider {
  name: "mapbox" | "nominatim";
  /** Whether results may be persisted permanently under the provider's terms. */
  permanentStorageAllowed: boolean;
  search(query: string, opts?: { country?: string; limit?: number }): Promise<GeoResult[]>;
}

const coord = z.number().finite();

export class MapboxGeocoder implements GeocodingProvider {
  name = "mapbox" as const;
  constructor(private token: string, public permanentStorageAllowed: boolean, private fetchImpl: typeof fetch = fetch) {}
  async search(query: string, opts: { country?: string; limit?: number } = {}) {
    const u = new URL("https://api.mapbox.com/search/geocode/v6/forward");
    u.searchParams.set("q", query);
    u.searchParams.set("access_token", this.token);
    u.searchParams.set("limit", String(opts.limit ?? 5));
    u.searchParams.set("types", "place,locality,neighborhood,postcode");
    if (this.permanentStorageAllowed) u.searchParams.set("permanent", "true");
    if (opts.country) u.searchParams.set("country", opts.country.toLowerCase());
    const res = await this.fetchImpl(u);
    if (res.status === 429) throw new AppError("RATE_LIMITED", "Geocoding provider rate limit reached.");
    if (!res.ok) throw new AppError("PROVIDER_ERROR", `Geocoding failed (${res.status}).`);
    const parsed = z.object({
      features: z.array(z.object({
        id: z.string(),
        geometry: z.object({ coordinates: z.tuple([coord, coord]) }),
        properties: z.object({ full_address: z.string().optional(), name: z.string(), context: z.any().optional() }),
      })),
    }).safeParse(await res.json());
    if (!parsed.success) throw new AppError("PROVIDER_ERROR", "Unexpected geocoding response.");
    return parsed.data.features.map((f) => ({
      label: f.properties.full_address ?? f.properties.name,
      lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], placeId: f.id,
      country: f.properties.context?.country?.country_code?.toUpperCase(), city: f.properties.context?.place?.name ?? f.properties.name,
    }));
  }
}

let lastNominatimCall = 0;
export class NominatimGeocoder implements GeocodingProvider {
  name = "nominatim" as const;
  permanentStorageAllowed = true; // ODbL data; attribution required
  constructor(private contactEmail: string, private fetchImpl: typeof fetch = fetch) {}
  async search(query: string, opts: { country?: string; limit?: number } = {}) {
    // Usage policy: max 1 request/second, identify the application, no heavy autocomplete.
    const wait = lastNominatimCall + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatimCall = Date.now();
    const u = new URL("https://nominatim.openstreetmap.org/search");
    u.searchParams.set("q", query);
    u.searchParams.set("format", "jsonv2");
    u.searchParams.set("addressdetails", "1");
    u.searchParams.set("limit", String(opts.limit ?? 5));
    u.searchParams.set("email", this.contactEmail);
    if (opts.country) u.searchParams.set("countrycodes", opts.country.toLowerCase());
    const res = await this.fetchImpl(u, { headers: { "User-Agent": `ClassBridge/0.1 (${this.contactEmail})` } });
    if (res.status === 429) throw new AppError("RATE_LIMITED", "Geocoding provider rate limit reached.");
    if (!res.ok) throw new AppError("PROVIDER_ERROR", `Geocoding failed (${res.status}).`);
    const parsed = z.array(z.object({
      place_id: z.union([z.number(), z.string()]), lat: z.string(), lon: z.string(), display_name: z.string(),
      address: z.record(z.string(), z.string()).optional(),
    })).safeParse(await res.json());
    if (!parsed.success) throw new AppError("PROVIDER_ERROR", "Unexpected geocoding response.");
    return parsed.data.flatMap((r) => {
      const lat = Number(r.lat), lng = Number(r.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      return [{ label: r.display_name, lat, lng, placeId: `osm:${r.place_id}`, country: r.address?.country_code?.toUpperCase(),
        city: r.address?.city ?? r.address?.town ?? r.address?.village }];
    });
  }
}

export function getGeocoder(): GeocodingProvider | null {
  const e = env();
  if (e.MAPBOX_ACCESS_TOKEN) return new MapboxGeocoder(e.MAPBOX_ACCESS_TOKEN, e.MAPBOX_PERMANENT_GEOCODING);
  if (e.NOMINATIM_CONTACT_EMAIL) return new NominatimGeocoder(e.NOMINATIM_CONTACT_EMAIL);
  return null;
}
