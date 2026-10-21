import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { crmService } from "../lib/domain/crm";
import { workspaceService, type Actor } from "../lib/domain/workspace";
import {
  can,
  permissions,
  roles,
  visibilityScope,
  type AccessContext,
} from "../lib/access/policy";
const alice: Actor = {
  id: "alice",
  name: "Alice",
  email: "alice@example.com",
  emailVerified: true,
};
const bob: Actor = {
  id: "bob",
  name: "Bob",
  email: "bob@example.com",
  emailVerified: true,
};
const carol: Actor = {
  id: "carol",
  name: "Carol",
  email: "carol@example.com",
  emailVerified: true,
};
const co = (name: string, extra = {}) => ({
  name,
  website: "",
  industry: "",
  ...extra,
});
async function fixture() {
  const pg = new PGlite();
  await pg.exec(readFileSync("drizzle/0000_talented_blade.sql", "utf8"));
  await pg.exec(readFileSync("drizzle/0001_shared_workspace.sql", "utf8"));
  const db = drizzle(pg, { schema });
  const ws = workspaceService(db);
  const crm = crmService(db);
  const [a] = await ws.available(alice);
  const [b] = await ws.available(bob);
  return { pg, db, ws, crm, a: a.id, b: b.id };
}

test("legacy migration preserves record IDs, counts and links in one private tenant per owner", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(readFileSync("drizzle/0000_talented_blade.sql", "utf8"));
    await pg.exec(
      `INSERT INTO crm_companies(id,owner_id,name) VALUES ('00000000-0000-4000-8000-000000000001','alice','A'), ('00000000-0000-4000-8000-000000000002','bob','B'); INSERT INTO crm_contacts(owner_id,name,email,company_id) VALUES ('alice','Contact','a@example.com','00000000-0000-4000-8000-000000000001'); INSERT INTO crm_deals(owner_id,name,company_id,value_cents) VALUES ('bob','Deal','00000000-0000-4000-8000-000000000002',125099);`,
    );
    await pg.transaction(async (tx) => {
      await tx.exec(readFileSync("drizzle/0001_shared_workspace.sql", "utf8"));
    });
    const db = drizzle(pg, { schema });
    const companies = await db.select().from(schema.companies);
    assert.equal(companies.length, 2);
    assert.notEqual(companies[0].organizationId, companies[1].organizationId);
    const [contact] = await db.select().from(schema.contacts);
    const [deal] = await db.select().from(schema.deals);
    assert.equal(contact.companyId, "00000000-0000-4000-8000-000000000001");
    assert.equal(
      contact.organizationId,
      companies.find((c) => c.ownerId === "alice")!.organizationId,
    );
    assert.equal(deal.value, 125099);
    assert.equal(
      deal.organizationId,
      companies.find((c) => c.ownerId === "bob")!.organizationId,
    );
    const members = await db.select().from(schema.memberships);
    assert.equal(members.length, 2);
    assert.ok(members.every((m) => m.role === "administrator"));
    const audit = await db.select().from(schema.auditEvents);
    assert.equal(audit.length, 2);
    assert.ok(
      audit.every(
        (a) =>
          a.action === "workspace.migrated" &&
          a.actorId === null &&
          a.afterData?.baseline === true,
      ),
    );
    const service = workspaceService(db);
    assert.equal(
      (await service.available(alice))[0].id,
      contact.organizationId,
    );
  } finally {
    await pg.close();
  }
});

test("tenant isolation covers list, detail, search, aggregate, update, delete, assignment and company links", async () => {
  const f = await fixture();
  try {
    const a = await f.crm.save(alice, f.a, "companies", co("Alice company"));
    const b = await f.crm.save(bob, f.b, "companies", co("Bob secret"));
    assert.equal((await f.crm.list(alice, f.a, "companies", "Bob")).total, 0);
    assert.equal(await f.crm.get(alice, f.a, "companies", b), null);
    assert.equal((await f.crm.stats(alice, f.a)).companies, 1);
    assert.equal(
      (await f.crm.companyOptions(alice, f.a)).rows.some((c) => c.id === b),
      false,
    );
    await assert.rejects(f.crm.list(alice, f.b, "companies"));
    await assert.rejects(f.crm.save(alice, f.a, "companies", co("Stolen"), b));
    await assert.rejects(f.crm.remove(alice, f.a, "companies", b));
    await assert.rejects(
      f.crm.save(alice, f.a, "deals", {
        name: "Invalid link",
        value: "10",
        stage: "Lead",
        companyId: b,
      }),
    );
    await assert.rejects(
      f.crm.save(alice, f.a, "companies", co("Bad owner", { ownerId: bob.id })),
    );
    // Database constraints still reject links if application validation is bypassed.
    await assert.rejects(
      f.db.insert(schema.contacts).values({
        organizationId: f.a,
        ownerId: alice.id,
        name: "Bad link",
        email: "x@example.com",
        companyId: b,
      }),
    );
    const id = await f.crm.save(alice, f.a, "deals", {
      name: "Good",
      value: "123.45",
      stage: "Lead",
      companyId: a,
      organizationId: f.b,
    });
    assert.equal(
      (await f.crm.get(alice, f.a, "deals", id))?.organizationId,
      f.a,
    );
  } finally {
    await f.pg.close();
  }
});

test("role presets, own/team visibility, team assignment and revoked membership are enforced", async () => {
  const f = await fixture();
  try {
    for (const [actor, role] of [
      [bob, "manager"],
      [carol, "representative"],
    ] as const)
      await f.ws.accept(
        actor,
        await f.ws.invite(alice, f.a, actor.email, role),
      );
    const team = await f.ws.createTeam(alice, f.a, "Sales");
    await f.ws.changeTeamMember(alice, f.a, team, bob.id);
    await f.ws.changeTeamMember(alice, f.a, team, carol.id);
    const shared = await f.crm.save(
      alice,
      f.a,
      "companies",
      co("Carol record", { ownerId: carol.id, assignedTeamId: team }),
    );
    const privateId = await f.crm.save(
      alice,
      f.a,
      "companies",
      co("Alice private"),
    );
    assert.equal((await f.crm.list(bob, f.a, "companies")).total, 1);
    assert.equal(
      (await f.crm.get(carol, f.a, "companies", shared))?.name,
      "Carol record",
    );
    assert.equal(await f.crm.get(carol, f.a, "companies", privateId), null);
    await assert.rejects(
      f.crm.save(
        carol,
        f.a,
        "companies",
        co("Escalated", { ownerId: alice.id }),
        shared,
      ),
    );
    await assert.rejects(
      f.crm.save(
        bob,
        f.a,
        "companies",
        co("Out of team", { ownerId: alice.id }),
      ),
    );
    await assert.rejects(f.ws.createTeam(bob, f.a, "Unauthorized"));
    await assert.rejects(f.ws.audit(bob, f.a));
    await f.ws.changeTeamMember(alice, f.a, team, carol.id, true);
    // Removing a peer does not hide an explicitly team-assigned record; remove its team assignment first.
    await f.crm.save(
      alice,
      f.a,
      "companies",
      co("Carol record", { ownerId: carol.id, assignedTeamId: "" }),
      shared,
    );
    assert.equal((await f.crm.list(bob, f.a, "companies")).total, 0);
    const linkedContact = {
      name: "Carol contact",
      email: "carol-contact@example.com",
      phone: "",
      role: "",
      notes: "",
      companyId: shared,
      ownerId: carol.id,
    };
    const contactId = await f.crm.save(alice, f.a, "contacts", linkedContact);
    await assert.rejects(
      f.crm.save(
        carol,
        f.a,
        "contacts",
        { ...linkedContact, companyId: privateId },
        contactId,
      ),
    );
    await f.crm.save(
      alice,
      f.a,
      "contacts",
      { ...linkedContact, companyId: privateId },
      contactId,
    );
    await f.crm.save(
      carol,
      f.a,
      "contacts",
      { ...linkedContact, name: "Updated own contact", companyId: privateId },
      contactId,
    );
    assert.equal(
      (await f.crm.get(carol, f.a, "contacts", contactId))?.name,
      "Updated own contact",
    );
    assert.equal(
      (await f.crm.companyOptions(carol, f.a)).rows.some(
        (c) => c.id === privateId,
      ),
      false,
    );
    await f.ws.changeMember(alice, f.a, carol.id, "read_only");
    assert.equal((await f.crm.list(carol, f.a, "companies")).total, 2);
    for (const action of [
      () => f.crm.save(carol, f.a, "companies", co("No")),
      () => f.crm.save(carol, f.a, "companies", co("No"), shared),
      () => f.crm.remove(carol, f.a, "companies", shared),
    ])
      await assert.rejects(action());
    await f.ws.changeMember(alice, f.a, carol.id, "read_only", true);
    await assert.rejects(f.crm.list(carol, f.a, "companies"));
    await assert.rejects(f.crm.stats(carol, f.a));
    await assert.rejects(f.ws.info(carol, f.a));
  } finally {
    await f.pg.close();
  }
});

test("every permission has an explicit fixed preset and unsupported scopes fail closed", () => {
  assert.ok(permissions.every((p) => can("administrator", p)));
  assert.equal(can("read_only", "view"), true);
  for (const p of permissions.filter((p) => p !== "view"))
    assert.equal(can("read_only", p), false);
  assert.equal(can("manager", "assign"), true);
  assert.equal(can("representative", "export"), false);
  assert.equal(can("manager", "approve"), true);
  assert.equal(can("unknown", "view"), false);
  assert.equal(roles.length, 4);
  assert.throws(() =>
    visibilityScope(schema.companies, {
      organizationId: "x",
      userId: "x",
      role: "administrator",
      scope: "department",
      peerIds: [],
      teamIds: [],
    } as unknown as AccessContext),
  );
});

test("soft deletion removes rows from all active queries and retains append-only audited data", async () => {
  const f = await fixture();
  try {
    const company = await f.crm.save(
      alice,
      f.a,
      "companies",
      co("Keep history"),
    );
    const deal = await f.crm.save(alice, f.a, "deals", {
      name: "Deal",
      value: "42",
      stage: "Proposal",
      companyId: company,
    });
    await assert.rejects(f.crm.remove(alice, f.a, "companies", company));
    await f.crm.remove(alice, f.a, "deals", deal);
    await f.crm.remove(alice, f.a, "companies", company);
    assert.equal(await f.crm.get(alice, f.a, "deals", deal), null);
    assert.equal((await f.crm.stats(alice, f.a)).pipeline, 0);
    assert.equal((await f.crm.companyOptions(alice, f.a)).rows.length, 0);
    const [retained] = await f.db
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.id, deal));
    assert.ok(retained.deletedAt);
    const audit = await f.ws.audit(alice, f.a);
    const deleted = audit.rows.find(
      (e) => e.entityId === deal && e.action === "record.deleted",
    );
    assert.ok(deleted?.beforeData);
    assert.ok(deleted?.afterData?.deletedAt);
    assert.equal(deleted?.actorId, alice.id);
    await assert.rejects(
      f.db.update(schema.auditEvents).set({ action: "forged" }),
    );
    await assert.rejects(f.db.delete(schema.auditEvents));
    await assert.rejects(f.db.execute(sql`TRUNCATE crm_audit_events`));
  } finally {
    await f.pg.close();
  }
});

test("business writes and membership changes roll back if audit persistence fails", async () => {
  const f = await fixture();
  try {
    await f.ws.accept(
      bob,
      await f.ws.invite(alice, f.a, bob.email, "representative"),
    );
    await f.pg.exec(
      `CREATE FUNCTION fail_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END; $$; CREATE TRIGGER fail_audit_test BEFORE INSERT ON crm_audit_events FOR EACH ROW EXECUTE FUNCTION fail_audit_test();`,
    );
    await assert.rejects(
      f.crm.save(alice, f.a, "companies", co("Must rollback")),
    );
    assert.equal((await f.crm.list(alice, f.a, "companies")).total, 0);
    await assert.rejects(
      f.ws.changeMember(alice, f.a, bob.id, "administrator"),
    );
    assert.equal((await f.ws.info(bob, f.a)).context.role, "representative");
  } finally {
    await f.pg.close();
  }
});

test("pagination is deterministic, scoped and searched with literal wildcard characters", async () => {
  const f = await fixture();
  try {
    await f.db.insert(schema.companies).values(
      Array.from({ length: 55 }, (_, i) => ({
        organizationId: f.a,
        ownerId: alice.id,
        name: `Company ${i}`,
        createdAt: new Date("2026-01-01"),
      })),
    );
    await f.crm.save(bob, f.b, "companies", co("Hidden"));
    const first = await f.crm.list(alice, f.a, "companies");
    const second = await f.crm.list(alice, f.a, "companies", "", 2);
    assert.equal(first.total, 55);
    assert.equal(first.rows.length, 50);
    assert.equal(second.rows.length, 5);
    const options = await f.crm.companyOptions(alice, f.a, "", 1, [
      second.rows[0].id,
    ]);
    assert.equal(options.total, 55);
    assert.ok(options.rows.some((c) => c.id === second.rows[0].id));
    assert.equal(
      new Set([...first.rows, ...second.rows].map((r) => r.id)).size,
      55,
    );
    assert.equal((await f.crm.list(alice, f.a, "companies", "%")).total, 0);
    assert.equal(
      (await f.crm.list(alice, f.a, "companies", "", "nonsense")).page,
      1,
    );
    assert.equal(
      (await f.crm.list(alice, f.a, "companies", "", 9999)).rows.length,
      0,
    );
  } finally {
    await f.pg.close();
  }
});

test("invitations require the matching verified email, are single-use, expire and respect inviter revocation", async () => {
  const f = await fixture();
  try {
    const token = await f.ws.invite(alice, f.a, carol.email, "representative");
    const [stored] = await f.db.select().from(schema.invitations);
    assert.notEqual(stored.tokenHash, token);
    await assert.rejects(f.ws.accept(bob, token));
    await assert.rejects(
      f.ws.accept({ ...carol, emailVerified: false }, token),
    );
    await f.ws.accept(carol, token);
    await assert.rejects(f.ws.accept(carol, token));
    const old = await f.ws.invite(alice, f.a, bob.email, "manager");
    await f.ws.invite(alice, f.a, bob.email, "read_only");
    await assert.rejects(f.ws.accept(bob, old));
    const revokeToken = await f.ws.invite(alice, f.a, bob.email, "read_only");
    const pending = (await f.ws.info(alice, f.a)).pendingInvitations.find(
      (i) => i.email === bob.email,
    )!;
    await f.ws.revokeInvitation(alice, f.a, pending.id);
    await assert.rejects(f.ws.accept(bob, revokeToken));
    const expired = await f.ws.invite(alice, f.a, bob.email, "manager");
    await f.db.update(schema.invitations).set({ expiresAt: new Date(0) });
    await assert.rejects(f.ws.accept(bob, expired));
    await assert.rejects(
      f.ws.changeMember(alice, f.a, alice.id, "representative"),
    );
    await f.ws.accept(
      bob,
      await f.ws.invite(alice, f.a, bob.email, "administrator"),
    );
    const finalInvitation = await f.ws.invite(
      alice,
      f.a,
      "other@example.com",
      "read_only",
    );
    await f.ws.changeMember(bob, f.a, alice.id, "administrator", true);
    await assert.rejects(
      f.ws.accept(
        { id: "other", email: "other@example.com", emailVerified: true },
        finalInvitation,
      ),
    );
    await assert.rejects(f.ws.available(alice));
    await assert.rejects(f.ws.info(alice, f.a));
  } finally {
    await f.pg.close();
  }
});
