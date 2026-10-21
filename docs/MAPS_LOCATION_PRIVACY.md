# Maps & location privacy

## What is implemented
- **Map**: Leaflet 1.9.4 + `leaflet.markercluster` on `/teachers?view=map`. Tiles: `NEXT_PUBLIC_MAP_TILE_URL` (default OpenStreetMap standard tiles) with visible attribution (`NEXT_PUBLIC_MAP_ATTRIBUTION`). List ↔ map synchronisation: clicking a marker highlights and scrolls to the card; "Search this area" re-queries the server with a `bbox`.
- **Radius search**: `earthdistance`/`cube` (PostGIS unavailable in embedded-postgres). GiST index on `ll_to_earth(approx_lat, approx_lng)`; query = `earth_box(...) @> ll_to_earth(...) AND earth_distance(...) <= radius`. Distances shown to students are computed from the *approximate* point and rounded to the nearest 0.5 km (`roundPublicDistanceKm` in `src/lib/geo/approx.ts`, applied in `src/lib/services/teacher-search.ts`; unit-tested in `tests/unit/search-and-geo.test.ts`).
- **Bounding-box search** for the visible map area.
- **City list fallback** (`cities` table, seeded with approximate city centres, source recorded per row). Students can pick "near city + radius"; teachers can set their area by city without any geocoder.
- **Browser geolocation** is optional ("Use my location"), never required; coordinates are used only in the search URL, not stored.
- **Geocoding adapter** (`src/lib/geo/geocoding.ts`): Mapbox v6 if `MAPBOX_ACCESS_TOKEN`; Nominatim only if `NOMINATIM_CONTACT_EMAIL` (user-triggered, ≤1 req/s throttle, identifying User-Agent, no autocomplete). Otherwise the UI states that no provider is configured — **no fake geocoding, no invented coordinates**.

## Privacy model
| Visibility | Public pin | Radius search | Profile shows |
|---|---|---|---|
| `approximate` (default) | snapped to a ~2 km grid (`src/lib/geo/approx.ts`) | yes (approximate point) | city, country, "approximate area" |
| `public` | ~100 m precision (3 decimals) — opt-in | yes | same |
| `private` | none | no | city only |

- Precise coordinates (`precise_lat/lng`) are stored **only** when the teacher opts in **and** the provider allows permanent storage (`permanent=true` Mapbox account flag). They are never selected by any public query (search SELECTs only `approx_*`). Integration test `auth-admin-search.test.ts` asserts private teachers expose no position.
- In-person bookings show the student only the teacher's city-level meeting area; exact addresses are exchanged in messages after confirmation, at the participants' discretion.
- Leaflet's default marker images are not used (div icons), so no third-party image requests besides tiles.

## Production notes
- The public OSM tile servers are for light use only (https://operations.osmfoundation.org/policies/tiles/); use a commercial or self-hosted tile provider for production traffic and set `NEXT_PUBLIC_MAP_TILE_URL`.
- Nominatim's public API policy (https://operations.osmfoundation.org/policies/nominatim/) forbids autocomplete and heavy use; for production use Mapbox/Google/your own Nominatim.
- Migrating to PostGIS: add `geography(Point)` columns from `approx_lat/lng`, replace the earthdistance predicate with `ST_DWithin`; the service layer isolates this in `teacher-search.ts`.
- City coordinates in the seed are manually compiled approximate centres — verify with a geocoder before relying on them.
