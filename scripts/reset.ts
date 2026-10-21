/** Drops and recreates the schema, applies all migrations, then seeds demo data (dev only). */
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { loadEnvFile } from "./load-env";
loadEnvFile();
if (process.env.NODE_ENV === "production") { console.error("Refusing to reset in production."); process.exit(1); }
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://classbridge:classbridge@127.0.0.1:54329/classbridge" });
await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
await pool.end();
execFileSync("npx", ["tsx", "scripts/migrate.ts"], { stdio: "inherit" });
execFileSync("npx", ["tsx", "scripts/seed.ts"], { stdio: "inherit" });
