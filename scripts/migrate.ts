import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL before running migrations.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log(
      "Committed migrations applied. Re-running uses the migration journal.",
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Migration failed. Check connectivity, permissions and the migration rehearsal guide. No credentials were logged.",
  );
  process.exitCode = 1;
});
