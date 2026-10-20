import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { companies, contacts, deals } from "../lib/db/schema";
loadEnvConfig(process.cwd());
async function main() {
  const ownerId = process.env.SEED_OWNER_ID;
  if (!process.env.DATABASE_URL || !ownerId)
    throw new Error(
      "Set DATABASE_URL and SEED_OWNER_ID (an existing Neon Auth user ID) before seeding.",
    );
  const db = drizzle(neon(process.env.DATABASE_URL));
  const users = await db.execute(
    sql`select id from neon_auth."user" where id = ${ownerId} limit 1`,
  );
  if (!users.rows.length)
    throw new Error(
      "SEED_OWNER_ID must belong to an existing Neon Auth user on this branch.",
    );
  function seedId(key: string) {
    const hex = createHash("sha256")
      .update(`splash-demo:${ownerId}:${key}`)
      .digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }
  const companyId = seedId("company");
  await db.batch([
    db
      .insert(companies)
      .values({
        id: companyId,
        ownerId,
        name: "Juniper Studio",
        industry: "Design",
        website: "https://example.com",
      })
      .onConflictDoNothing(),
    db
      .insert(contacts)
      .values({
        id: seedId("contact"),
        ownerId,
        companyId,
        name: "Alex Morgan",
        email: "alex@example.com",
        role: "Creative director",
        notes: "Demo contact. Replace with your own connections.",
      })
      .onConflictDoNothing(),
    db
      .insert(deals)
      .values({
        id: seedId("deal"),
        ownerId,
        companyId,
        name: "Brand refresh",
        value: 450000,
        stage: "Proposal",
      })
      .onConflictDoNothing(),
  ]);
  console.log(
    "Demo records ready. Re-running this command does not duplicate them.",
  );
}
main().catch(() => {
  console.error(
    "Seed failed. Verify DATABASE_URL, migrations, and an existing SEED_OWNER_ID. No credentials were logged.",
  );
  process.exitCode = 1;
});
