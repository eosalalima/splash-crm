import "server-only";
import { desc, ilike, or, and, count, sum, eq } from "drizzle-orm";
import { getDb } from "./db";
import { companies, contacts, deals } from "./db/schema";
import { requireUser } from "./auth/server";
import { ownerScope, recordScope } from "./ownership";
import {
  type Kind,
  idSchema,
  companyInput,
  contactInput,
  dealInput,
} from "./validation";
export const tables = { contacts, companies, deals };
export async function listRecords(kind: Kind, search = "") {
  const user = await requireUser();
  const table = tables[kind];
  const escaped = search.slice(0, 160).replace(/[\\%_]/g, "\\$&");
  return getDb()
    .select()
    .from(table)
    .where(
      and(
        ownerScope(table, user.id),
        escaped
          ? kind === "contacts"
            ? or(
                ilike(contacts.name, `%${escaped}%`),
                ilike(contacts.email, `%${escaped}%`),
              )
            : ilike(table.name, `%${escaped}%`)
          : undefined,
      ),
    )
    .orderBy(desc(table.createdAt))
    .limit(200);
}
export async function getRecord(kind: Kind, id: string) {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return null;
  const table = tables[kind];
  const [record] = await getDb()
    .select()
    .from(table)
    .where(recordScope(table, user.id, id));
  return record ?? null;
}
export async function companyOptions() {
  const user = await requireUser();
  return getDb()
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(ownerScope(companies, user.id))
    .orderBy(companies.name);
}
export async function saveRecord(kind: Kind, input: unknown, id?: string) {
  const user = await requireUser();
  const db = getDb();
  if (id) idSchema.parse(id);
  const data =
    kind === "companies"
      ? companyInput.parse(input)
      : kind === "contacts"
        ? contactInput.parse(input)
        : dealInput.parse(input);
  // The composite foreign key enforces this same ownership invariant atomically.
  if ("companyId" in data && data.companyId) {
    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(recordScope(companies, user.id, data.companyId));
    if (!company) throw new Error("Select one of your companies.");
  }
  let result;
  if (kind === "companies") {
    const values = {
      ...companyInput.parse(input),
      ownerId: user.id,
      updatedAt: new Date(),
    };
    result = id
      ? await db
          .update(companies)
          .set(values)
          .where(recordScope(companies, user.id, id))
          .returning({ id: companies.id })
      : await db
          .insert(companies)
          .values(values)
          .returning({ id: companies.id });
  } else if (kind === "contacts") {
    const values = {
      ...contactInput.parse(input),
      ownerId: user.id,
      updatedAt: new Date(),
    };
    result = id
      ? await db
          .update(contacts)
          .set(values)
          .where(recordScope(contacts, user.id, id))
          .returning({ id: contacts.id })
      : await db.insert(contacts).values(values).returning({ id: contacts.id });
  } else {
    const values = {
      ...dealInput.parse(input),
      ownerId: user.id,
      updatedAt: new Date(),
    };
    result = id
      ? await db
          .update(deals)
          .set(values)
          .where(recordScope(deals, user.id, id))
          .returning({ id: deals.id })
      : await db.insert(deals).values(values).returning({ id: deals.id });
  }
  if (!result.length) throw new Error("Record not found or unavailable.");
  return result[0].id;
}
export async function deleteRecord(kind: Kind, id: string) {
  const user = await requireUser();
  idSchema.parse(id);
  const table = tables[kind];
  const rows = await getDb()
    .delete(table)
    .where(recordScope(table, user.id, id))
    .returning({ id: table.id });
  if (!rows.length) throw new Error("Record not found or unavailable.");
}
export async function dashboardStats() {
  const user = await requireUser();
  const db = getDb();
  const [c, co, d, stages] = await Promise.all([
    db
      .select({ count: count() })
      .from(contacts)
      .where(ownerScope(contacts, user.id)),
    db
      .select({ count: count() })
      .from(companies)
      .where(ownerScope(companies, user.id)),
    db
      .select({ count: count(), value: sum(deals.value) })
      .from(deals)
      .where(
        and(
          ownerScope(deals, user.id),
          or(
            eq(deals.stage, "Lead"),
            eq(deals.stage, "Qualified"),
            eq(deals.stage, "Proposal"),
          ),
        ),
      ),
    db
      .select({ stage: deals.stage, count: count(), value: sum(deals.value) })
      .from(deals)
      .where(ownerScope(deals, user.id))
      .groupBy(deals.stage),
  ]);
  return {
    contacts: c[0].count,
    companies: co[0].count,
    openDeals: d[0].count,
    pipeline: Number(d[0].value ?? 0),
    stages,
  };
}
