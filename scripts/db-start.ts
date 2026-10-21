/**
 * Starts a REAL PostgreSQL server (embedded-postgres binaries) for local dev/tests.
 * Data dir: $PGDATA_DIR or ./.pgdata. Port: $PGPORT or 54329.
 * Runs in the foreground until killed when invoked with --foreground; otherwise starts and exits,
 * leaving the postgres process running (pg_ctl-managed).
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const dataDir = process.env.PGDATA_DIR ?? path.resolve(".pgdata");
const port = Number(process.env.PGPORT ?? 54329);

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "classbridge",
    password: "classbridge",
    port,
    persistent: true,
    onLog: () => {},
    onError: (e) => console.error(String(e)),
  });
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log(`Initialising cluster in ${dataDir}`);
    await pg.initialise();
  }
  await pg.start();
  for (const db of ["classbridge", "classbridge_test"]) {
    try {
      await pg.createDatabase(db);
      console.log(`created database ${db}`);
    } catch {
      /* exists */
    }
  }
  console.log(`PostgreSQL running on postgres://classbridge:classbridge@127.0.0.1:${port}/classbridge`);
  // embedded-postgres stops the server when this process exits, so keep it alive.
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 1 << 30);
}
main().catch((e) => { console.error(e); process.exit(1); });
