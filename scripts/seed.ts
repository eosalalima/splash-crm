import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { workspaceService } from "../lib/domain/workspace";
import { crmService } from "../lib/domain/crm";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.DATABASE_URL || !process.env.SEED_OWNER_ID)
    throw new Error("Configure DATABASE_URL and SEED_OWNER_ID.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const db = drizzle(pool, { schema });
    const result = await db.execute(
      sql`select id, name, email from neon_auth."user" where id = ${process.env.SEED_OWNER_ID} limit 1`,
    );
    const user = result.rows[0];
    if (!user)
      throw new Error(
        "SEED_OWNER_ID must identify an existing Neon Auth user.",
      );
    const actor = {
      id: String(user.id),
      name: String(user.name),
      email: String(user.email),
    };
    const workspace = workspaceService(db);
    await workspace.available(actor);
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(sql`${schema.organizations.legacyOwnerId} = ${actor.id}`);
    if (!org)
      throw new Error("No private workspace is available for this owner.");
    const crm = crmService(db);
    // Seed only an empty private workspace. Never seed another member's records.
    if (
      (await crm.list(actor, org.id, "companies")).total ||
      (await crm.list(actor, org.id, "contacts")).total ||
      (await crm.list(actor, org.id, "deals")).total
    )
      throw new Error(
        "Seed only an empty workspace; existing data is preserved.",
      );
    const companyId = await crm.save(actor, org.id, "companies", {
      name: "Juniper Studio",
      industry: "Design",
      website: "https://example.com",
    });
    await crm.save(actor, org.id, "contacts", {
      name: "Alex Morgan",
      email: "alex@example.com",
      phone: "",
      role: "Creative director",
      notes: "Demo contact.",
      companyId,
    });
    await crm.save(actor, org.id, "deals", {
      name: "Brand refresh",
      value: "4500",
      stage: "Proposal",
      companyId,
    });
    console.log(
      "Created demo records with audit history. No migrations were run.",
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Seed failed. Check identity, workspace permissions, migrations and connectivity. No credentials were logged.",
  );
  process.exitCode = 1;
});
