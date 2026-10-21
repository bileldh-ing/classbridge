import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadEnvFile } from "./load-env";

loadEnvFile();
const url = process.env.DATABASE_URL ?? "postgres://classbridge:classbridge@127.0.0.1:54329/classbridge";
const pool = new Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
console.log(`migrations applied to ${url.replace(/:[^:@/]+@/, ":***@")}`);
await pool.end();
