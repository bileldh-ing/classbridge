/** Recreates the integration-test database schema from the committed migrations (real PostgreSQL). */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export default async function setup() {
  if (process.env.SKIP_DB === "1") return;
  const url = process.env.TEST_DATABASE_URL ?? "postgres://classbridge:classbridge@127.0.0.1:54329/classbridge_test";
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } catch (e) {
    throw new Error(`Integration DB unavailable at ${url.replace(/:[^:@/]+@/, ":***@")}. Run \`pnpm db:start\` first. (${String(e)})`);
  } finally {
    await pool.end();
  }
}
