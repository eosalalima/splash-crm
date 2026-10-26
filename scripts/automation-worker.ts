import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../lib/db/schema";
import { automationWorker } from "../lib/domain/automation-worker";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 20000,
  });
  const worker = automationWorker(drizzle(pool, { schema }));
  let stopping = false;
  let wake: (() => void) | undefined;
  const stop = () => {
    stopping = true;
    wake?.();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    do {
      try {
        const worked = await worker.tick();
        if (process.argv.includes("--once")) break;
        if (worked) continue;
      } catch (error) {
        if (process.argv.includes("--once")) throw error;
        console.error(
          "Automation poll failed. Check database connectivity and committed migrations; credentials were not logged.",
        );
      }
      if (!stopping)
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            wake = undefined;
            resolve();
          }, 5000);
          wake = () => {
            clearTimeout(timer);
            wake = undefined;
            resolve();
          };
        });
    } while (!stopping);
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Automation worker could not start. Check configuration; credentials were not logged.",
  );
  process.exitCode = 1;
});
