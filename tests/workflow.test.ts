import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { crmService } from "../lib/domain/crm";
import { workflowService } from "../lib/domain/workflow";
import { workspaceService } from "../lib/domain/workspace";
const alice = {
  id: "alice",
  email: "alice@example.com",
  name: "Alice",
  emailVerified: true,
};
const bob = {
  id: "bob",
  email: "bob@example.com",
  name: "Bob",
  emailVerified: true,
};
const reader = {
  id: "reader",
  email: "reader@example.com",
  name: "Reader",
  emailVerified: true,
};
async function fixture() {
  const pg = new PGlite();
  for (const file of [
    "0000_talented_blade",
    "0001_shared_workspace",
    "0002_crm_operating_workflow",
    "0003_funnel_design_execution",
  ])
    await pg.exec(readFileSync(`drizzle/${file}.sql`, "utf8"));
  const db = drizzle(pg, { schema });
  const ws = workspaceService(db),
    crm = crmService(db),
    flow = workflowService(db);
  const [a] = await ws.available(alice),
    [b] = await ws.available(bob);
  return { pg, db, ws, crm, flow, a: a.id, b: b.id };
}
test("lead conversion captures provenance, preserves existing matches and is idempotent", async () => {
  const f = await fixture();
  try {
    const source = await f.flow.configure(alice, f.a, "sources", {
      name: "Referral",
    });
    const lead = await f.crm.save(alice, f.a, "leads", {
      name: "Alex",
      email: "ALEX@example.com",
      companyName: "Acme",
      sourceId: source,
      score: "80",
      scoreReason: "Manually qualified",
      tags: "vip, vip, referral",
      notes: "Met at event",
    });
    const first = await f.flow.convert(alice, f.a, { leadId: lead });
    assert.deepEqual(
      await f.flow.convert(alice, f.a, {
        leadId: lead,
        createOpportunity: false,
      }),
      first,
    );
    assert.equal((await f.crm.list(alice, f.a, "contacts")).total, 1);
    assert.equal((await f.crm.list(alice, f.a, "companies")).total, 1);
    assert.equal((await f.crm.list(alice, f.a, "deals")).total, 1);
    const [converted] = await f.db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.id, lead));
    assert.equal(converted.convertedBy, alice.id);
    assert.equal(converted.status, "converted");
    assert.equal(converted.convertedContactId, first.contactId);
    assert.deepEqual(converted.tags, ["vip", "referral"]);
    const deal = await f.crm.get(alice, f.a, "deals", first.dealId!);
    assert.ok(deal && "sourceId" in deal);
    assert.equal(deal.sourceId, source);
    await assert.rejects(
      f.crm.save(
        alice,
        f.a,
        "leads",
        { name: "Change", email: "alex@example.com" },
        lead,
      ),
      /read-only/,
    );
    const lead2 = await f.crm.save(alice, f.a, "leads", {
      name: "Alex again",
      email: "alex@example.com",
    });
    const matched = await f.flow.convert(alice, f.a, {
      leadId: lead2,
      contactId: first.contactId,
      companyId: first.companyId,
      createOpportunity: false,
    });
    assert.equal(matched.contactId, first.contactId);
    assert.equal(matched.dealId, null);
    assert.equal((await f.crm.list(alice, f.a, "contacts")).total, 1);
    const timeline = await f.flow.customer360(alice, f.a, "leads", lead);
    assert.equal(timeline.converted.length, 3);
    assert.ok(timeline.events.some((e) => e.action === "lead.converted"));
  } finally {
    await f.pg.close();
  }
});
test("conversion rejects cross-tenant/hidden matches and rolls back all records on audit failure", async () => {
  const f = await fixture();
  try {
    const lead = await f.crm.save(alice, f.a, "leads", {
      name: "Alex",
      email: "alex@example.com",
      companyName: "New account",
    });
    const foreign = await f.crm.save(bob, f.b, "companies", {
      name: "Foreign",
      website: "",
      industry: "",
    });
    await assert.rejects(
      f.flow.convert(alice, f.a, { leadId: lead, companyId: foreign }),
      /unavailable/,
    );
    await assert.rejects(f.flow.convert(bob, f.b, { leadId: lead }));
    await f.ws.accept(
      reader,
      await f.ws.invite(alice, f.a, reader.email, "read_only"),
    );
    await assert.rejects(f.flow.convert(reader, f.a, { leadId: lead }));
    await f.pg.exec(
      `CREATE FUNCTION fail_conversion_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'lead.converted' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_conversion_audit BEFORE INSERT ON crm_audit_events FOR EACH ROW EXECUTE FUNCTION fail_conversion_audit();`,
    );
    await assert.rejects(f.flow.convert(alice, f.a, { leadId: lead }));
    assert.equal((await f.crm.list(alice, f.a, "companies")).total, 0);
    assert.equal((await f.crm.list(alice, f.a, "contacts")).total, 0);
    assert.equal((await f.crm.list(alice, f.a, "deals")).total, 0);
    const [unchanged] = await f.db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.id, lead));
    assert.equal(unchanged.convertedAt, null);
  } finally {
    await f.pg.close();
  }
});
test("activities validate outcomes, relate through Customer 360, retain completion time and respect scope/deletion", async () => {
  const f = await fixture();
  try {
    const lead = await f.crm.save(alice, f.a, "leads", {
      name: "Alex",
      email: "alex@example.com",
      companyName: "Account",
    });
    const result = await f.flow.convert(alice, f.a, { leadId: lead });
    const activity = {
      name: "Follow up",
      type: "email",
      priority: "high",
      status: "open",
      dueAt: "2026-11-01T09:00:00Z",
      contactId: result.contactId,
      notes: "Manual email log",
    };
    const id = await f.crm.save(alice, f.a, "activities", activity);
    assert.equal(
      (await f.flow.customer360(alice, f.a, "companies", result.companyId!))
        .activities.length,
      1,
    );
    await assert.rejects(
      f.crm.save(
        alice,
        f.a,
        "activities",
        { ...activity, status: "completed" },
        id,
      ),
      /outcome/,
    );
    await f.crm.save(
      alice,
      f.a,
      "activities",
      { ...activity, status: "completed", outcome: "Customer replied" },
      id,
    );
    const [before] = await f.db
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.id, id));
    await f.crm.save(
      alice,
      f.a,
      "activities",
      { ...activity, status: "completed", outcome: "Confirmed reply" },
      id,
    );
    const [after] = await f.db
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.id, id));
    assert.deepEqual(before.completedAt, after.completedAt);
    assert.equal((await f.crm.list(bob, f.b, "activities")).total, 0);
    await assert.rejects(f.flow.customer360(bob, f.b, "activities", id));
    await f.crm.remove(alice, f.a, "activities", id);
    assert.equal(
      (await f.flow.customer360(alice, f.a, "companies", result.companyId!))
        .activities.length,
      0,
    );
    const foreign = await f.crm.save(bob, f.b, "leads", {
      name: "Other",
      email: "other@example.com",
    });
    await assert.rejects(
      f.crm.save(alice, f.a, "activities", { ...activity, leadId: foreign }),
      /available/,
    );
  } finally {
    await f.pg.close();
  }
});
test("catalog configuration is administrator-only and product prices remain snapshotted after edit/archive", async () => {
  const f = await fixture();
  try {
    await f.ws.accept(
      reader,
      await f.ws.invite(alice, f.a, reader.email, "representative"),
    );
    await assert.rejects(
      f.flow.configure(reader, f.a, "sources", { name: "Forbidden" }),
    );
    const product = await f.flow.configure(alice, f.a, "products", {
      name: "Design",
      price: "1250.99",
      sku: "D1",
    });
    const lead = await f.crm.save(alice, f.a, "leads", {
      name: "Alex",
      email: "alex@example.com",
    });
    const result = await f.flow.convert(alice, f.a, { leadId: lead });
    await f.flow.attachProduct(alice, f.a, result.dealId!, {
      productId: product,
      quantity: 2,
    });
    await f.flow.configure(
      alice,
      f.a,
      "products",
      { name: "Design", price: "2000", sku: "D1" },
      product,
    );
    await f.flow.attachProduct(alice, f.a, result.dealId!, {
      productId: product,
      quantity: 3,
    });
    let timeline = await f.flow.customer360(
      alice,
      f.a,
      "deals",
      result.dealId!,
    );
    assert.equal(timeline.lines[0].unitPrice, 125099);
    assert.equal(timeline.lines[0].quantity, 3);
    await f.flow.configure(
      alice,
      f.a,
      "products",
      { name: "Design", price: "2000" },
      product,
      true,
    );
    assert.equal((await f.flow.configuration(alice, f.a)).products.length, 0);
    timeline = await f.flow.customer360(alice, f.a, "deals", result.dealId!);
    assert.equal(timeline.lines.length, 1);
    await assert.rejects(
      f.flow.attachProduct(alice, f.a, result.dealId!, {
        productId: product,
        quantity: 4,
      }),
    );
    await f.flow.attachProduct(alice, f.a, result.dealId!, {
      productId: product,
      quantity: 0,
    });
    assert.equal(
      (await f.flow.customer360(alice, f.a, "deals", result.dealId!)).lines
        .length,
      0,
    );
    await assert.rejects(
      f.flow.attachProduct(bob, f.b, result.dealId!, {
        productId: product,
        quantity: 1,
      }),
    );
  } finally {
    await f.pg.close();
  }
});
test("duplicate warnings, search, timelines and pagination never expose hidden or other-tenant records", async () => {
  const f = await fixture();
  try {
    const id = await f.crm.save(alice, f.a, "leads", {
      name: "One",
      email: "same@example.com",
    });
    await f.crm.save(alice, f.a, "leads", {
      name: "Two",
      email: "same@example.com",
    });
    await f.crm.save(bob, f.b, "leads", {
      name: "Secret",
      email: "same@example.com",
    });
    assert.equal((await f.flow.duplicates(alice, f.a, "leads", id)).length, 1);
    await f.ws.accept(
      reader,
      await f.ws.invite(alice, f.a, reader.email, "representative"),
    );
    const own = await f.crm.save(reader, f.a, "leads", {
      name: "Own",
      email: "same@example.com",
    });
    assert.equal(
      (await f.flow.duplicates(reader, f.a, "leads", own)).length,
      0,
    );
    await assert.rejects(f.flow.customer360(reader, f.a, "leads", id));
    assert.equal((await f.crm.list(reader, f.a, "leads", "Secret")).total, 0);
    await f.db.insert(schema.activities).values(
      Array.from({ length: 52 }, (_, i) => ({
        organizationId: f.a,
        ownerId: alice.id,
        name: `Call ${i}`,
        type: "call",
        leadId: id,
      })),
    );
    const first = await f.flow.customer360(alice, f.a, "leads", id, 1),
      second = await f.flow.customer360(alice, f.a, "leads", id, 2);
    assert.equal(first.total, 52);
    assert.equal(first.activities.length, 50);
    assert.equal(second.activities.length, 2);
    assert.ok(
      !first.activities.some((a) =>
        second.activities.some((b) => b.id === a.id),
      ),
    );
  } finally {
    await f.pg.close();
  }
});

test("workflow validation and tenant foreign keys reject invalid values and forged relationships", async () => {
  const f = await fixture();
  try {
    const lead = await f.crm.save(alice, f.a, "leads", {
      name: "Lead",
      email: "lead@example.com",
    });
    const foreign = await f.crm.save(bob, f.b, "leads", {
      name: "Foreign",
      email: "foreign@example.com",
    });
    await assert.rejects(
      f.db.insert(schema.activities).values({
        organizationId: f.a,
        ownerId: alice.id,
        name: "Forged",
        type: "call",
        leadId: foreign,
      }),
    );
    await assert.rejects(
      f.db.insert(schema.activities).values({
        organizationId: f.a,
        ownerId: alice.id,
        name: "No outcome",
        type: "call",
        status: "completed",
      }),
    );
    await assert.rejects(
      f.crm.save(alice, f.a, "leads", {
        name: "Invalid score",
        email: "lead@example.com",
        score: 101,
        scoreReason: "Out of range",
      }),
    );
    await assert.rejects(
      f.crm.save(alice, f.a, "companies", {
        name: "Invalid lifecycle",
        website: "",
        industry: "",
        lifecycle: "invented",
      }),
    );
    const base = {
      name: "Opportunity",
      value: "1250.99",
      stage: "Lead",
      companyId: "",
      expectedClose: "2026-12-31",
      probability: 65,
      status: "won",
      notes: "Independent outcome",
      tags: "pilot",
    };
    const id = await f.crm.save(alice, f.a, "deals", base);
    assert.equal((await f.crm.stats(alice, f.a)).openDeals, 0);
    const record = await f.crm.get(alice, f.a, "deals", id);
    assert.ok(record && "probability" in record);
    assert.equal(record.probability, 65);
    assert.equal(record.expectedClose, "2026-12-31");
    assert.equal(record.value, 125099);
    await assert.rejects(
      f.crm.save(alice, f.a, "deals", { ...base, probability: 101 }, id),
    );
    await assert.rejects(
      f.crm.save(
        alice,
        f.a,
        "deals",
        { ...base, expectedClose: "2026-02-30" },
        id,
      ),
    );
    await f.crm.save(alice, f.a, "leads", {
      name: "Duplicate",
      email: "LEAD@example.com",
    });
    assert.equal(
      (
        await f.flow.duplicateCandidates(
          alice,
          f.a,
          "leads",
          "lead@example.com",
        )
      ).length,
      2,
    );
    assert.equal(
      (await f.flow.duplicateCandidates(bob, f.b, "leads", "lead@example.com"))
        .length,
      0,
    );
    await f.crm.remove(alice, f.a, "leads", lead);
    await assert.rejects(f.flow.convert(alice, f.a, { leadId: lead }));
  } finally {
    await f.pg.close();
  }
});

test("Phase 2 migration preserves legacy opportunity IDs, money and links while mapping outcome status", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(readFileSync("drizzle/0000_talented_blade.sql", "utf8"));
    await pg.exec(
      `INSERT INTO crm_companies(id,owner_id,name) VALUES ('10000000-0000-4000-8000-000000000001','legacy','Account'); INSERT INTO crm_deals(id,owner_id,name,value_cents,stage,company_id) VALUES ('10000000-0000-4000-8000-000000000002','legacy','Won',125099,'Won','10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000003','legacy','Lost',999999999,'Lost','10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000004','legacy','Open',100,'Proposal','10000000-0000-4000-8000-000000000001');`,
    );
    await pg.exec(readFileSync("drizzle/0001_shared_workspace.sql", "utf8"));
    await pg.transaction((tx) =>
      tx.exec(readFileSync("drizzle/0002_crm_operating_workflow.sql", "utf8")),
    );
    const db = drizzle(pg, { schema });
    const rows = await db.select().from(schema.deals);
    assert.equal(rows.length, 3);
    assert.equal(rows.find((r) => r.name === "Won")!.status, "won");
    assert.equal(rows.find((r) => r.name === "Lost")!.status, "lost");
    assert.equal(rows.find((r) => r.name === "Open")!.status, "open");
    assert.equal(rows.find((r) => r.name === "Won")!.value, 125099);
    assert.equal(rows.find((r) => r.name === "Lost")!.value, 999999999);
    assert.ok(
      rows.every(
        (r) =>
          r.companyId === "10000000-0000-4000-8000-000000000001" &&
          r.probability === 0 &&
          r.expectedClose === null,
      ),
    );
    assert.ok(
      rows.some((r) => r.id === "10000000-0000-4000-8000-000000000002"),
    );
    assert.equal((await db.select().from(schema.auditEvents)).length, 1);
  } finally {
    await pg.close();
  }
});
