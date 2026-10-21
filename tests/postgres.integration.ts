import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, and, isNull } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { workspaceService } from "../lib/domain/workspace";
import { crmService } from "../lib/domain/crm";

test("transactional PostgreSQL migration replay, audit rollback, concurrent last-admin protection and revocation", async () => {
  const url = process.env.PHASE1_TEST_DATABASE_URL;
  assert.ok(
    url,
    "Set PHASE1_TEST_DATABASE_URL to a disposable PostgreSQL database.",
  );
  assert.match(
    new URL(url).pathname,
    /^\/splash_phase1_[A-Za-z0-9_]+$/,
    "Use a dedicated database named splash_phase1_*; never a live CRM database.",
  );
  const pool = new Pool({ connectionString: url, max: 6 });
  try {
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    const beforeReplay = await pool.query(
      "SELECT count(*) FROM drizzle.__drizzle_migrations",
    );
    await migrate(db, { migrationsFolder: "./drizzle" });
    assert.equal(
      (await pool.query("SELECT count(*) FROM drizzle.__drizzle_migrations"))
        .rows[0].count,
      beforeReplay.rows[0].count,
    );
    const suffix = randomUUID();
    const a = {
      id: `a-${suffix}`,
      email: `a-${suffix}@example.com`,
      name: "A",
      emailVerified: true,
    };
    const b = {
      id: `b-${suffix}`,
      email: `b-${suffix}@example.com`,
      name: "B",
      emailVerified: true,
    };
    const rep = {
      id: `r-${suffix}`,
      email: `r-${suffix}@example.com`,
      name: "Rep",
      emailVerified: true,
    };
    const ws = workspaceService(db);
    const crm = crmService(db);
    const org = await ws.createOrganization(a, "Concurrency fixture");
    await ws.accept(b, await ws.invite(a, org, b.email, "administrator"));
    const changes = await Promise.allSettled([
      ws.changeMember(a, org, a.id, "representative"),
      ws.changeMember(b, org, b.id, "representative"),
    ]);
    assert.equal(changes.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(changes.filter((r) => r.status === "rejected").length, 1);
    const admins = await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.organizationId, org),
          eq(schema.memberships.role, "administrator"),
          isNull(schema.memberships.revokedAt),
        ),
      );
    assert.equal(admins.length, 1);
    const admin = admins[0].userId === a.id ? a : b;
    await ws.accept(
      rep,
      await ws.invite(admin, org, rep.email, "representative"),
    );
    await crm.save(rep, org, "companies", {
      name: "Before revocation",
      website: "",
      industry: "",
    });
    await ws.changeMember(admin, org, rep.id, "representative", true);
    await assert.rejects(
      crm.save(rep, org, "companies", {
        name: "After revocation",
        website: "",
        industry: "",
      }),
    );
    const id = await crm.save(admin, org, "companies", {
      name: "Atomic audit",
      website: "",
      industry: "",
    });
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        `CREATE FUNCTION phase1_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit insert rejected'; END; $$; CREATE TRIGGER phase1_fail_audit BEFORE INSERT ON crm_audit_events FOR EACH ROW EXECUTE FUNCTION phase1_fail_audit();`,
      );
      await blocker.query("COMMIT");
      await assert.rejects(
        crm.save(
          admin,
          org,
          "companies",
          { name: "Must rollback", website: "", industry: "" },
          id,
        ),
      );
      assert.equal(
        (await crm.get(admin, org, "companies", id))?.name,
        "Atomic audit",
      );
    } finally {
      await blocker.query(
        "DROP TRIGGER IF EXISTS phase1_fail_audit ON crm_audit_events; DROP FUNCTION IF EXISTS phase1_fail_audit()",
      );
      blocker.release();
    }
  } finally {
    await pool.end();
  }
});

test("concurrent lead conversion creates one result and conversion audit failure rolls back every write", async () => {
  const url = process.env.PHASE1_TEST_DATABASE_URL;
  assert.ok(url);
  assert.match(new URL(url).pathname, /^\/splash_phase1_[A-Za-z0-9_]+$/);
  const pool = new Pool({ connectionString: url, max: 6 });
  try {
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    const { workflowService } = await import("../lib/domain/workflow");
    const flow = workflowService(db),
      crm = crmService(db),
      ws = workspaceService(db);
    const actor = {
      id: randomUUID(),
      email: `${randomUUID()}@example.com`,
      emailVerified: true,
    };
    const org = await ws.createOrganization(actor, "Phase 2 concurrency");
    const leadId = await crm.save(actor, org, "leads", {
      name: "Concurrent lead",
      email: "lead@example.com",
      companyName: "Account",
    });
    const [first, second] = await Promise.all([
      flow.convert(actor, org, { leadId }),
      flow.convert(actor, org, { leadId }),
    ]);
    assert.deepEqual(first, second);
    for (const kind of ["contacts", "companies", "deals"] as const)
      assert.equal((await crm.list(actor, org, kind)).total, 1);
    const another = await crm.save(actor, org, "leads", {
      name: "Rollback lead",
      email: "rollback@example.com",
      companyName: "Rollback account",
    });
    await pool.query(
      `CREATE FUNCTION phase2_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'lead.converted' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$; CREATE TRIGGER phase2_fail_audit BEFORE INSERT ON crm_audit_events FOR EACH ROW EXECUTE FUNCTION phase2_fail_audit();`,
    );
    try {
      await assert.rejects(flow.convert(actor, org, { leadId: another }));
      for (const kind of ["contacts", "companies", "deals"] as const)
        assert.equal((await crm.list(actor, org, kind)).total, 1);
    } finally {
      await pool.query(
        "DROP TRIGGER IF EXISTS phase2_fail_audit ON crm_audit_events; DROP FUNCTION IF EXISTS phase2_fail_audit()",
      );
    }
  } finally {
    await pool.end();
  }
});
