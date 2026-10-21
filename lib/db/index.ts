import "server-only";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
const globalDb = globalThis as unknown as { crmPool?: Pool };
export function getDb() {
  if (!process.env.DATABASE_URL)
    throw new Error("Database is not configured. See README.md.");
  globalDb.crmPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 10000,
  });
  return drizzle(globalDb.crmPool, { schema });
}
