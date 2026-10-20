import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { companies, contacts, deals } from "../lib/db/schema";
import { ownerScope, recordScope } from "../lib/ownership";
import { companyInput, contactInput, dealInput } from "../lib/validation";

test("CRM migrations and ownership predicates enforce isolated CRUD and company links", async () => {
  const pg = new PGlite();
  try {
    for (const file of readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await pg.exec(readFileSync(`drizzle/${file}`, "utf8"));
    const db = drizzle(pg);
    assert.throws(() => ownerScope(contacts, ""), /Authentication required/);
    const [a] = await db
      .insert(companies)
      .values({ ownerId: "alice", name: "Alice Co" })
      .returning();
    const [b] = await db
      .insert(companies)
      .values({ ownerId: "bob", name: "Bob Co" })
      .returning();
    const [person] = await db
      .insert(contacts)
      .values({
        ownerId: "alice",
        name: "Alice Contact",
        email: "a@example.com",
        companyId: a.id,
      })
      .returning();
    const [deal] = await db
      .insert(deals)
      .values({
        ownerId: "alice",
        name: "New deal",
        value: 125099,
        companyId: a.id,
      })
      .returning();
    assert.equal(
      (await db.select().from(contacts).where(ownerScope(contacts, "bob")))
        .length,
      0,
    );
    assert.equal(
      (await db.select().from(companies).where(ownerScope(companies, "alice")))
        .length,
      1,
    );
    assert.equal(
      (
        await db
          .select()
          .from(deals)
          .where(recordScope(deals, "bob", deal.id))
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .update(contacts)
          .set({ name: "Intruder" })
          .where(recordScope(contacts, "bob", person.id))
          .returning()
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .delete(contacts)
          .where(recordScope(contacts, "bob", person.id))
          .returning()
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .delete(companies)
          .where(recordScope(companies, "bob", a.id))
          .returning()
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .update(deals)
          .set({ stage: "Won" })
          .where(recordScope(deals, "bob", deal.id))
          .returning()
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .delete(deals)
          .where(recordScope(deals, "bob", deal.id))
          .returning()
      ).length,
      0,
    );
    await assert.rejects(
      db
        .insert(contacts)
        .values({
          ownerId: "alice",
          name: "Invalid link",
          email: "a@example.com",
          companyId: b.id,
        }),
    );
    await assert.rejects(
      db
        .update(deals)
        .set({ companyId: b.id })
        .where(recordScope(deals, "alice", deal.id)),
    );
    await assert.rejects(
      db.delete(companies).where(recordScope(companies, "alice", a.id)),
    );
    const [updated] = await db
      .update(contacts)
      .set({ name: "Updated" })
      .where(recordScope(contacts, "alice", person.id))
      .returning();
    assert.equal(updated.name, "Updated");
    const [won] = await db
      .update(deals)
      .set({ stage: "Won" })
      .where(recordScope(deals, "alice", deal.id))
      .returning();
    assert.equal(won.stage, "Won");
    assert.equal(won.value, 125099);
    assert.equal(
      (
        await db
          .delete(contacts)
          .where(recordScope(contacts, "alice", person.id))
          .returning()
      ).length,
      1,
    );
    assert.equal(
      (
        await db
          .delete(deals)
          .where(recordScope(deals, "alice", deal.id))
          .returning()
      ).length,
      1,
    );
    assert.equal(
      (
        await db
          .delete(companies)
          .where(recordScope(companies, "alice", a.id))
          .returning()
      ).length,
      1,
    );
    assert.equal(
      (await db.select().from(companies).where(ownerScope(companies, "bob")))[0]
        .name,
      "Bob Co",
    );
  } finally {
    await pg.close();
  }
});
test("CRM validation rejects malformed fields and keeps currency precise", () => {
  const deal = {
    name: "Website",
    value: "1250.99",
    stage: "Lead",
    companyId: "",
  };
  assert.equal(dealInput.parse(deal).value, 125099);
  assert.equal(dealInput.parse(deal).companyId, null);
  for (const value of ["-1", "Infinity", "1.999", "10000000", "", "abc"])
    assert.equal(dealInput.safeParse({ ...deal, value }).success, false);
  assert.equal(
    dealInput.safeParse({ ...deal, stage: "Invented" }).success,
    false,
  );
  assert.equal(
    companyInput.safeParse({ name: "", website: "", industry: "" }).success,
    false,
  );
  assert.equal(
    companyInput.safeParse({
      name: "Co",
      website: "javascript:alert(1)",
      industry: "",
    }).success,
    false,
  );
  assert.equal(
    contactInput.safeParse({
      name: "A",
      email: "wrong",
      phone: "",
      role: "",
      notes: "",
      companyId: "",
    }).success,
    false,
  );
  const validated = companyInput.parse({
    name: " Co ",
    website: "",
    industry: "",
    ownerId: "intruder",
  });
  assert.equal(validated.name, "Co");
  assert.equal("ownerId" in validated, false);
});
