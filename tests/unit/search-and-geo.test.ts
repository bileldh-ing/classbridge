import { describe, expect, it } from "vitest";
import { parseTeacherSearch, serializeTeacherSearch } from "@/lib/validation/search";
import { haversineKm, publicPosition, APPROX_GRID_DEG } from "@/lib/geo/approx";

describe("search parameter validation", () => {
  it("coerces and defaults", () => {
    const r = parseTeacherSearch({ q: "maths", minPrice: "10", page: "2", mode: "", subject: "mathematics" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.minPrice).toBe(10);
      expect(r.data.page).toBe(2);
      expect(r.data.mode).toBeUndefined();
      expect(r.data.sort).toBe("relevance");
    }
  });
  it("rejects invalid input", () => {
    expect(parseTeacherSearch({ minPrice: "50", maxPrice: "10" }).success).toBe(false);
    expect(parseTeacherSearch({ lat: "10" }).success).toBe(false);
    expect(parseTeacherSearch({ subject: "DROP TABLE" }).success).toBe(false);
    expect(parseTeacherSearch({ pageSize: "500" }).success).toBe(false);
    expect(parseTeacherSearch({ radiusKm: "5000" }).success).toBe(false);
  });
  it("serialises canonically (sorted keys, defaults omitted)", () => {
    expect(serializeTeacherSearch({ subject: "maths", q: "x", page: 1, sort: "relevance" })).toBe("q=x&subject=maths");
    expect(serializeTeacherSearch({ page: 3, mode: "online" })).toBe("mode=online&page=3");
  });
});

describe("location privacy", () => {
  it("private locations have no public position", () => {
    expect(publicPosition(36.8065, 10.1815, "private")).toBeNull();
  });
  it("approximate positions are snapped to a grid within ~2 km and are deterministic", () => {
    const p = publicPosition(36.80651, 10.18153, "approximate")!;
    expect(p).toEqual(publicPosition(36.8099, 10.1801, "approximate"));
    expect(haversineKm(p, { lat: 36.80651, lng: 10.18153 })).toBeLessThan(APPROX_GRID_DEG * 111 * 1.5);
    expect(p.lat).not.toBe(36.80651);
  });
  it("public precision is capped at ~110 m", () => {
    expect(publicPosition(36.806512, 10.181534, "public")).toEqual({ lat: 36.807, lng: 10.182 });
  });
  it("rejects invalid coordinates", () => {
    expect(publicPosition(NaN, 10, "approximate")).toBeNull();
    expect(publicPosition(95, 10, "public")).toBeNull();
  });
});
