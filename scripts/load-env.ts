import { existsSync } from "node:fs";
/** Loads .env.local then .env (without overriding already-set variables), like Next.js does. */
export function loadEnvFile() {
  for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
}
