/**
 * Server-side teacher directory search: Postgres full-text + pg_trgm, normalized filters,
 * earthdistance radius on PUBLIC approximate coordinates, pagination with total count.
 * Only published teachers of active accounts are returned. Precise coordinates are never selected.
 */
import { sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "../db";
import type { TeacherSearch } from "../validation/search";
import { minorUnitDigits } from "../money";
import { roundPublicDistanceKm } from "../geo/approx";

export type TeacherCard = {
  id: string; slug: string; displayName: string; avatarUrl: string | null; headline: string;
  languages: string[]; levels: string[]; hourlyRateMinor: number; currency: string;
  offersOnline: boolean; offersInPerson: boolean; isDemo: boolean;
  subjects: string[]; badges: string[]; ratingAvg: number | null; ratingCount: number;
  city: string | null; country: string | null; position: { lat: number; lng: number } | null;
  distanceKm: number | null; minOfferingMinutes: number | null;
};

export async function searchTeachers(db: DbOrTx, s: TeacherSearch, locale = "en"): Promise<{ items: TeacherCard[]; total: number; page: number; pageSize: number }> {
  const where: SQL[] = [sql`tp.publish_state = 'published'`, sql`u.status = 'active'`];
  const subjCol = locale === "fr" ? sql.raw("s.name_fr") : locale === "ar" ? sql.raw("s.name_ar") : sql.raw("s.name_en");

  const fts = sql`to_tsvector('simple', coalesce(tp.headline,'') || ' ' || coalesce(tp.bio,'') || ' ' || coalesce(tp.teaching_approach,''))`;
  let rank: SQL = sql`0`;
  if (s.q) {
    const like = `%${s.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(sql`(
      ${fts} @@ websearch_to_tsquery('simple', ${s.q})
      OR tp.headline % ${s.q}
      OR p.display_name ILIKE ${like}
      OR EXISTS (SELECT 1 FROM teacher_subjects ts2 JOIN subjects s2 ON s2.id = ts2.subject_id
                 WHERE ts2.teacher_id = tp.id AND (s2.name_en ILIKE ${like} OR s2.name_fr ILIKE ${like} OR s2.name_ar ILIKE ${like} OR s2.slug ILIKE ${like}))
    )`);
    rank = sql`(ts_rank(${fts}, websearch_to_tsquery('simple', ${s.q})) + similarity(tp.headline, ${s.q}))`;
  }
  if (s.subject) where.push(sql`EXISTS (SELECT 1 FROM teacher_subjects ts3 JOIN subjects s3 ON s3.id = ts3.subject_id WHERE ts3.teacher_id = tp.id AND s3.slug = ${s.subject})`);
  if (s.level) where.push(sql`${s.level} = ANY(tp.levels)`);
  if (s.language) where.push(sql`${s.language} = ANY(tp.languages)`);
  if (s.mode === "online") where.push(sql`tp.offers_online`);
  if (s.mode === "in_person") where.push(sql`tp.offers_in_person`);
  if (s.minPrice !== undefined || s.maxPrice !== undefined) {
    const cur = s.currency ?? "EUR";
    const f = 10 ** minorUnitDigits(cur);
    where.push(sql`tp.currency = ${cur}`);
    if (s.minPrice !== undefined) where.push(sql`tp.hourly_rate_minor >= ${Math.round(s.minPrice * f)}`);
    if (s.maxPrice !== undefined) where.push(sql`tp.hourly_rate_minor <= ${Math.round(s.maxPrice * f)}`);
  }
  if (s.city) where.push(sql`lower(tl.city) = lower(${s.city})`);
  if (s.verified) where.push(sql`EXISTS (SELECT 1 FROM teacher_badges b WHERE b.teacher_id = tp.id AND b.revoked_at IS NULL)`);
  if (s.minRating !== undefined) where.push(sql`coalesce(rv.avg, 0) >= ${s.minRating} AND coalesce(rv.cnt, 0) >= 1`);

  const hasPublicPos = sql`(tl.visibility <> 'private' AND tl.approx_lat IS NOT NULL AND tl.approx_lng IS NOT NULL)`;
  let distance: SQL = sql`NULL::float8`;
  if (s.lat !== undefined && s.lng !== undefined) {
    distance = sql`CASE WHEN ${hasPublicPos} THEN earth_distance(ll_to_earth(tl.approx_lat, tl.approx_lng), ll_to_earth(${s.lat}, ${s.lng})) / 1000.0 END`;
    if (s.radiusKm) {
      const m = s.radiusKm * 1000;
      where.push(sql`${hasPublicPos}`);
      where.push(sql`earth_box(ll_to_earth(${s.lat}, ${s.lng}), ${m}) @> ll_to_earth(tl.approx_lat, tl.approx_lng)`);
      where.push(sql`earth_distance(ll_to_earth(tl.approx_lat, tl.approx_lng), ll_to_earth(${s.lat}, ${s.lng})) <= ${m}`);
    }
  }
  if (s.bbox) {
    const [w, so, e, n] = s.bbox.split(",").map(Number);
    where.push(sql`${hasPublicPos} AND tl.approx_lat BETWEEN ${so} AND ${n} AND tl.approx_lng BETWEEN ${w} AND ${e}`);
  }

  const order: SQL = {
    relevance: s.q ? sql`rank DESC, tp.published_at DESC` : sql`coalesce(rv.cnt,0) DESC, tp.published_at DESC`,
    price_asc: sql`tp.hourly_rate_minor ASC`,
    price_desc: sql`tp.hourly_rate_minor DESC`,
    // Rating sort uses a minimum review threshold (3) so one 5★ review does not outrank established teachers.
    rating: sql`CASE WHEN coalesce(rv.cnt,0) >= 3 THEN rv.avg ELSE 0 END DESC, coalesce(rv.cnt,0) DESC`,
    newest: sql`tp.published_at DESC NULLS LAST`,
  }[s.sort];
  const orderWithDistance = s.lat !== undefined && s.sort === "relevance" && !s.q ? sql`distance ASC NULLS LAST, ${order}` : order;

  const offset = (s.page - 1) * s.pageSize;
  const res = await db.execute<{
    id: string; slug: string; display_name: string; avatar_url: string | null; headline: string; languages: string[]; levels: string[];
    hourly_rate_minor: number; currency: string; offers_online: boolean; offers_in_person: boolean; is_demo: boolean;
    subjects: string[] | null; badges: string[] | null; rating_avg: string | null; rating_count: number | null;
    city: string | null; country: string | null; pub_lat: number | null; pub_lng: number | null; distance: number | null;
    min_minutes: number | null; total: string;
  }>(sql`
    SELECT tp.id, tp.slug, p.display_name, p.avatar_url, tp.headline, tp.languages, tp.levels, tp.hourly_rate_minor, tp.currency,
      tp.offers_online, tp.offers_in_person, tp.is_demo,
      (SELECT array_agg(${subjCol} ORDER BY ${subjCol}) FROM teacher_subjects ts JOIN subjects s ON s.id = ts.subject_id WHERE ts.teacher_id = tp.id) AS subjects,
      (SELECT array_agg(DISTINCT b.badge::text) FROM teacher_badges b WHERE b.teacher_id = tp.id AND b.revoked_at IS NULL) AS badges,
      rv.avg AS rating_avg, rv.cnt AS rating_count,
      tl.city, tl.country,
      CASE WHEN ${hasPublicPos} THEN tl.approx_lat END AS pub_lat,
      CASE WHEN ${hasPublicPos} THEN tl.approx_lng END AS pub_lng,
      ${distance} AS distance,
      (SELECT min(o.duration_minutes) FROM lesson_offerings o WHERE o.teacher_id = tp.id AND o.status = 'published') AS min_minutes,
      ${rank} AS rank,
      count(*) OVER () AS total
    FROM teacher_profiles tp
    JOIN users u ON u.id = tp.user_id
    JOIN profiles p ON p.user_id = tp.user_id
    LEFT JOIN teacher_locations tl ON tl.teacher_id = tp.id
    LEFT JOIN LATERAL (
      SELECT round(avg(r.rating)::numeric, 2) AS avg, count(*)::int AS cnt FROM reviews r WHERE r.teacher_id = tp.id AND r.status = 'published'
    ) rv ON true
    WHERE ${sql.join(where, sql` AND `)}
    ORDER BY ${orderWithDistance}, tp.id
    LIMIT ${s.pageSize} OFFSET ${offset}`);

  const items: TeacherCard[] = res.rows.map((r) => ({
    id: r.id, slug: r.slug, displayName: r.display_name, avatarUrl: r.avatar_url, headline: r.headline,
    languages: r.languages, levels: r.levels, hourlyRateMinor: Number(r.hourly_rate_minor), currency: r.currency,
    offersOnline: r.offers_online, offersInPerson: r.offers_in_person, isDemo: r.is_demo,
    subjects: r.subjects ?? [], badges: r.badges ?? [],
    ratingAvg: r.rating_avg === null ? null : Number(r.rating_avg), ratingCount: Number(r.rating_count ?? 0),
    city: r.city, country: r.country,
    position: r.pub_lat !== null && r.pub_lng !== null ? { lat: Number(r.pub_lat), lng: Number(r.pub_lng) } : null,
    distanceKm: r.distance === null ? null : roundPublicDistanceKm(Number(r.distance)),
    minOfferingMinutes: r.min_minutes === null ? null : Number(r.min_minutes),
  }));
  return { items, total: Number(res.rows[0]?.total ?? 0), page: s.page, pageSize: s.pageSize };
}
