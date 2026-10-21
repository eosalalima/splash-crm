import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "@/lib/db/schema";
// Shared transactional PostgreSQL interface used by pg in production and PGlite in tests.
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
