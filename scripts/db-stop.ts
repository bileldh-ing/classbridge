/** Stops the embedded PostgreSQL cluster started by db:start (fast shutdown via pg_ctl). */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const epRequire = createRequire(require.resolve("embedded-postgres"));
const platformPkg = `@embedded-postgres/${process.platform}-${process.arch}`;
const pkgDir = path.dirname(path.dirname(epRequire.resolve(platformPkg)));
const pgCtl = path.join(pkgDir, "native", "bin", "pg_ctl");
const dataDir = process.env.PGDATA_DIR ?? path.resolve(".pgdata");
try {
  execFileSync(pgCtl, ["stop", "-D", dataDir, "-m", "fast"], { stdio: "inherit" });
} catch {
  console.error("pg_ctl stop failed (server may not be running)");
  process.exitCode = 1;
}
