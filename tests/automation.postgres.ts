import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { workspaceService } from "../lib/domain/workspace";
import { crmService } from "../lib/domain/crm";
import { funnelService } from "../lib/domain/funnels";
import { automationService } from "../lib/domain/automation";
import { automationWorker, LeaseLost } from "../lib/domain/automation-worker";
test("PostgreSQL competing claims, expired leases, stale worker fencing and committed-effect crash recovery", async () => {
  const url = process.env.PHASE1_TEST_DATABASE_URL;
  assert.ok(
    url,
    "Set PHASE1_TEST_DATABASE_URL to an isolated PostgreSQL database.",
  );
  assert.match(new URL(url).pathname, /^\/splash_phase1_[A-Za-z0-9_]+$/);
  const pool = new Pool({ connectionString: url, max: 6 });
  try {
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    const suffix = randomUUID(),
      actor = {
        id: `m4-${suffix}`,
        email: `m4-${suffix}@example.com`,
        emailVerified: true,
      };
    const ws = workspaceService(db),
      crm = crmService(db),
      funnels = funnelService(db),
      automation = automationService(db);
    const org = await ws.createOrganization(
      actor,
      "Worker concurrency fixture",
    );
    const funnel = await funnels.create(actor, org, { name: "M4 sales" });
    const version = await funnels.publish(actor, org, funnel, {
      expectedRevision: 1,
      commandKey: randomUUID(),
    });
    const deal = await crm.save(actor, org, "deals", {
      name: "Concurrent worker opportunity",
      stage: "Lead",
      value: "10",
      companyId: "",
    });
    await automation.publish(actor, org, {
      name: "M4 actions",
      expectedRevision: 0,
      commandKey: randomUUID(),
      funnelVersionId: version.id,
      stageId: "lead",
      definition: {
        recipientId: actor.id,
        conditions: [],
        actions: [
          { id: "task", kind: "task", title: "One task", dueHours: 0 },
          { id: "notify", kind: "notification", title: "One notice" },
        ],
      },
    });
    await funnels.enroll(actor, org, {
      dealId: deal,
      versionId: version.id,
      commandKey: randomUUID(),
    });
    // Drain previous integration fixtures without changing their identities.
    const worker = automationWorker(db);
    while (await worker.tick()) {}
    const deal2 = await crm.save(actor, org, "deals", {
      name: "Race target",
      stage: "Lead",
      value: "10",
      companyId: "",
    });
    await funnels.enroll(actor, org, {
      dealId: deal2,
      versionId: version.id,
      commandKey: randomUUID(),
    });
    const competitors = await Promise.all([
      automationWorker(db).claim(),
      automationWorker(db).claim(),
    ]);
    assert.equal(competitors.filter(Boolean).length, 1);
    const lease = competitors.find(Boolean)!;
    let crashed = false;
    await assert.rejects(
      worker.process(lease, {
        afterAction: async () => {
          if (!crashed) {
            crashed = true;
            throw new Error("crash after commit");
          }
        },
      }),
    );
    await db
      .update(schema.outboxEvents)
      .set({ leaseUntil: new Date(0) })
      .where(eq(schema.outboxEvents.id, lease.id));
    const recovered = (await worker.claim())!;
    assert.equal(recovered.id, lease.id);
    assert.notEqual(recovered.token, lease.token);
    await assert.rejects(worker.process(lease), LeaseLost);
    // Two processes sharing a stale copy of one token must still serialize effects.
    const results = await Promise.allSettled([
      worker.process(recovered),
      automationWorker(db).process(recovered),
    ]);
    assert.ok(results.some((r) => r.status === "fulfilled"));
    const tasks = await db
      .select()
      .from(schema.activities)
      .where(
        and(
          eq(schema.activities.organizationId, org),
          eq(schema.activities.dealId, deal2),
        ),
      );
    const notices = await db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.organizationId, org),
          eq(schema.notifications.dealId, deal2),
        ),
      );
    assert.equal(tasks.length, 1);
    assert.equal(notices.length, 1);
    assert.equal(
      (
        await db
          .select()
          .from(schema.outboxEvents)
          .where(eq(schema.outboxEvents.id, lease.id))
      )[0].status,
      "completed",
    );
  } finally {
    await pool.end();
  }
});
