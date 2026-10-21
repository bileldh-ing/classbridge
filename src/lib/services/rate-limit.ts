import { sql } from "drizzle-orm";
import type { DbOrTx } from "../db";
import { AppError } from "../errors";

/** Fixed-window rate limiter persisted in Postgres (works across multiple app instances). */
export async function rateLimit(db: DbOrTx, key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; count: number }> {
  const res = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds}), 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`);
  const count = Number(res.rows[0]?.count ?? 1);
  return { allowed: count <= limit, count };
}

export async function enforceRateLimit(db: DbOrTx, key: string, limit: number, windowSeconds: number) {
  const r = await rateLimit(db, key, limit, windowSeconds);
  if (!r.allowed) throw new AppError("RATE_LIMITED", "Too many requests. Please wait and try again.");
}
