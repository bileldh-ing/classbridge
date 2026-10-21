import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "../env";

export type DB = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as the db. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;

const g = globalThis as unknown as { __cbPool?: Pool; __cbDb?: DB };

export function getPool(): Pool {
  if (!g.__cbPool) {
    g.__cbPool = new Pool({ connectionString: env().DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
  }
  return g.__cbPool;
}

export function getDb(): DB {
  if (!g.__cbDb) g.__cbDb = drizzle(getPool(), { schema });
  return g.__cbDb;
}

export async function closeDb() {
  await g.__cbPool?.end();
  g.__cbPool = undefined;
  g.__cbDb = undefined;
}

export { schema };
