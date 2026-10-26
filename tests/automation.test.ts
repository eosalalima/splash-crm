import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { workspaceService } from "../lib/domain/workspace";
import { crmService } from "../lib/domain/crm";
import { funnelService } from "../lib/domain/funnels";
import { automationService } from "../lib/domain/automation";
import {
  automationWorker,
  LeaseLost,
  MAX_ATTEMPTS,
} from "../lib/domain/automation-worker";
import {
  automationDefinitionInput,
  conditionsMatch,
  type AutomationDefinition,
} from "../lib/automation/definition";
const admin = { id: "admin", email: "admin@example.com", emailVerified: true };
const rep = { id: "rep", email: "rep@example.com", emailVerified: true };
const other = { id: "other", email: "other@example.com", emailVerified: true };
async function fixture() {
  const pg = new PGlite();
  for (const file of [
    "0000_talented_blade",
    "0001_shared_workspace",
    "0002_crm_operating_workflow",
    "0003_funnel_design_execution",
    "0004_m4_basic_automation",
  ])
    await pg.exec(readFileSync(`drizzle/${file}.sql`, "utf8"));
  const db = drizzle(pg, { schema }),
    ws = workspaceService(db),
    crm = crmService(db),
    funnels = funnelService(db),
    automation = automationService(db),
    worker = automationWorker(db);
  const org = await ws.createOrganization(admin, "Automation fixture");
  const foreign = await ws.createOrganization(other, "Foreign fixture");
  await ws.accept(
    rep,
    await ws.invite(admin, org, rep.email, "representative"),
  );
  const id = await funnels.create(admin, org, { name: "Sales" });
  const publication = await funnels.publish(admin, org, id, {
    expectedRevision: 1,
    commandKey: randomUUID(),
  });
  const version = publication.id;
  const dealId = await crm.save(rep, org, "deals", {
    name: "Opportunity",
    value: "100",
    stage: "Lead",
    companyId: "",
  });
  const enrolled = await funnels.enroll(rep, org, {
    dealId,
    versionId: version,
    commandKey: randomUUID(),
  });
  const definition: AutomationDefinition = {
    recipientId: rep.id,
    conditions: [],
    actions: [
      { id: "follow-up", kind: "task", title: "Call customer", dueHours: 24 },
      { id: "notify", kind: "notification", title: "Follow up now" },
    ],
  };
  const publish = (extra = {}) =>
    automation.publish(admin, org, {
      name: "Follow-up",
      expectedRevision: 0,
      commandKey: randomUUID(),
      funnelVersionId: version,
      stageId: "lead",
      definition,
      ...extra,
    });
  return {
    pg,
    db,
    ws,
    crm,
    funnels,
    automation,
    worker,
    org,
    foreign,
    version,
    dealId,
    enrolled,
    definition,
    publish,
  };
}
async function expire(f: Awaited<ReturnType<typeof fixture>>, id: string) {
  await f.db
    .update(schema.outboxEvents)
    .set({ leaseUntil: new Date(Date.now() - 1000) })
    .where(eq(schema.outboxEvents.id, id));
}
test("typed conditions reject arbitrary code/operators and distinguish zero probability", () => {
  const snapshot = {
    status: "open",
    value: 10000,
    probability: 0,
    expectedClose: null,
  };
  assert.equal(
    conditionsMatch(
      [
        { field: "probability", operator: "lte", value: 0 },
        { field: "expectedClose", operator: "absent" },
      ],
      snapshot,
    ),
    true,
  );
  assert.equal(
    conditionsMatch(
      [{ field: "status", operator: "neq", value: "open" }],
      snapshot,
    ),
    false,
  );
  assert.equal(
    conditionsMatch(
      [{ field: "value", operator: "gte", value: 10001 }],
      snapshot,
    ),
    false,
  );
  assert.throws(() =>
    automationDefinitionInput.parse({
      recipientId: "rep",
      conditions: [{ field: "status", operator: "eval", value: "open" }],
      actions: [],
    }),
  );
  assert.throws(() =>
    automationDefinitionInput.parse({
      recipientId: "rep",
      conditions: [],
      actions: [
        { id: "x", kind: "notification", title: "x" },
        { id: "x", kind: "notification", title: "y" },
      ],
    }),
  );
});
test("queued pre-M4 events use latest publication/current fields once; effects survive crash and version changes", async () => {
  const f = await fixture();
  try {
    const workflowId = await f.publish({
      definition: {
        ...f.definition,
        conditions: [{ field: "status", operator: "eq", value: "won" }],
      },
    });
    const v2 = {
      ...f.definition,
      conditions: [
        {
          field: "status" as const,
          operator: "eq" as const,
          value: "lost" as const,
        },
      ],
    };
    const command = {
      id: workflowId,
      expectedRevision: 1,
      commandKey: randomUUID(),
      definition: v2,
    };
    assert.equal(await f.publish(command), workflowId);
    assert.equal(await f.publish(command), workflowId);
    await assert.rejects(f.publish({ ...command, definition: f.definition }));
    await f.db
      .update(schema.deals)
      .set({ status: "lost" })
      .where(eq(schema.deals.id, f.dealId));
    const lease = (await f.worker.claim())!;
    let crashed = false;
    await assert.rejects(
      f.worker.process(lease, {
        afterAction: async () => {
          if (!crashed) {
            crashed = true;
            throw new Error("process crash");
          }
        },
      }),
    );
    assert.equal((await f.db.select().from(schema.activities)).length, 1);
    assert.equal((await f.db.select().from(schema.notifications)).length, 0);
    await f.publish({
      id: workflowId,
      expectedRevision: 2,
      definition: {
        ...f.definition,
        actions: [
          {
            id: "other",
            kind: "task",
            title: "Do not run on retry",
            dueHours: 1,
          },
        ],
      },
    });
    await f.db
      .update(schema.deals)
      .set({ status: "open" })
      .where(eq(schema.deals.id, f.dealId));
    await expire(f, lease.id);
    const recovered = (await f.worker.claim())!;
    await assert.rejects(f.worker.process(lease), LeaseLost);
    await f.worker
      .process(recovered, {
        beforeAcknowledge: async () => {
          throw new Error("ack crash");
        },
      })
      .catch(() => {});
    await expire(f, lease.id);
    await f.worker.tick();
    const [event] = await f.db.select().from(schema.outboxEvents);
    assert.equal(event.status, "completed");
    assert.equal(event.plan!.snapshot.status, "lost");
    const [task] = await f.db.select().from(schema.activities);
    assert.equal(task.name, "Call customer");
    assert.equal(task.ownerId, rep.id);
    assert.equal(task.dealId, f.dealId);
    const [transition] = await f.db.select().from(schema.transitionEvents);
    assert.equal(
      task.dueAt!.getTime(),
      transition.createdAt.getTime() + 24 * 3600000,
    );
    assert.equal((await f.db.select().from(schema.activities)).length, 1);
    assert.equal((await f.db.select().from(schema.notifications)).length, 1);
    assert.equal(
      (await f.db.select().from(schema.automationActions)).length,
      2,
    );
    assert.equal(
      (await f.db.select().from(schema.automationRuns))[0].status,
      "completed",
    );
    await assert.rejects(
      f.pg.exec(`UPDATE crm_automation_versions SET stage_id='lost'`),
    );
    await assert.rejects(
      f.pg.exec(`UPDATE crm_automation_actions SET action_id='changed'`),
    );
    await assert.rejects(f.pg.exec(`UPDATE crm_outbox_events SET plan='{}'`));
  } finally {
    await f.pg.close();
  }
});
test("conditions skip nonmatches; terminal completion is a stage-entry trigger without changing opportunity status", async () => {
  const f = await fixture();
  try {
    await f.publish({
      definition: {
        ...f.definition,
        conditions: [{ field: "value", operator: "gte", value: 999999 }],
      },
    });
    await f.publish({ stageId: "lost" });
    await f.worker.tick();
    assert.equal(
      (await f.db.select().from(schema.automationRuns))[0].status,
      "skipped",
    );
    await f.funnels.move(rep, f.org, {
      instanceId: f.enrolled.instanceId,
      targetStage: "lost",
      expectedRevision: 1,
      reason: "Other",
      commandKey: randomUUID(),
    });
    await f.worker.tick();
    assert.equal((await f.db.select().from(schema.activities)).length, 1);
    assert.equal((await f.db.select().from(schema.notifications)).length, 1);
    assert.equal((await f.db.select().from(schema.deals))[0].status, "open");
    const events = await f.db.select().from(schema.outboxEvents);
    assert.equal(
      events.find((e) => e.type === "journey.completed")!.status,
      "completed",
    );
  } finally {
    await f.pg.close();
  }
});
test("revoked recipient fails visibly; only an administrator can replay with original effects retained", async () => {
  const f = await fixture();
  try {
    await f.publish();
    // Pin plan while originating actor can act; recipient will subsequently lose access.
    const lease = (await f.worker.claim())!;
    await f.worker.prepare(lease);
    await f.ws.changeMember(admin, f.org, rep.id, "representative", true);
    try {
      await f.worker.process(lease);
    } catch (e) {
      await f.worker.fail(lease, e);
    }
    assert.equal(
      (await f.db.select().from(schema.outboxEvents))[0].status,
      "failed",
    );
    assert.equal((await f.db.select().from(schema.activities)).length, 0);
    await assert.rejects(f.automation.replay(other, f.foreign, lease.id));
    await assert.rejects(f.automation.replay(rep, f.org, lease.id));
    await f.ws.accept(
      rep,
      await f.ws.invite(admin, f.org, rep.email, "representative"),
    );
    await f.automation.replay(admin, f.org, lease.id);
    await f.worker.tick();
    assert.equal((await f.db.select().from(schema.activities)).length, 1);
    await assert.rejects(f.automation.replay(admin, f.org, lease.id));
    assert.ok(
      (await f.db.select().from(schema.auditEvents)).some(
        (a) => a.action === "automation.replayed",
      ),
    );
  } finally {
    await f.pg.close();
  }
});
test("notification reads and actions enforce recipient, current visibility and tenant isolation", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.automation.publish(rep, f.org, {}));
    await assert.rejects(
      f.publish({ definition: { ...f.definition, recipientId: other.id } }),
    );
    await f.publish();
    await f.worker.tick();
    const inbox = await f.automation.inbox(rep, f.org);
    assert.equal(inbox.total, 1);
    const id = inbox.rows[0].notification.id;
    await assert.rejects(
      f.db
        .insert(schema.notifications)
        .values({
          ...inbox.rows[0].notification,
          id: randomUUID(),
          organizationId: f.foreign,
        }),
    );
    await assert.rejects(
      f.pg.exec(`UPDATE crm_notifications SET message='rewritten'`),
    );
    assert.equal((await f.automation.inbox(admin, f.org)).total, 0);
    await assert.rejects(f.automation.markRead(admin, f.org, id));
    await assert.rejects(f.automation.markRead(other, f.foreign, id));
    await f.automation.markRead(rep, f.org, id);
    assert.ok(
      (await f.automation.inbox(rep, f.org)).rows[0].notification.readAt,
    );
    const firstRead = (await f.automation.inbox(rep, f.org)).rows[0]
      .notification.readAt;
    await f.automation.markRead(rep, f.org, id);
    assert.equal(
      (
        await f.automation.inbox(rep, f.org)
      ).rows[0].notification.readAt!.getTime(),
      firstRead!.getTime(),
    );
    await f.db
      .update(schema.deals)
      .set({ ownerId: admin.id })
      .where(eq(schema.deals.id, f.dealId));
    assert.equal((await f.automation.inbox(rep, f.org)).total, 0);
    await assert.rejects(f.automation.markRead(rep, f.org, id));
    await f.ws.changeMember(admin, f.org, rep.id, "representative", true);
    await assert.rejects(f.automation.inbox(rep, f.org));
  } finally {
    await f.pg.close();
  }
});
test("retry bounds, lease expiry and transactional audit rollback preserve effects", async () => {
  const f = await fixture();
  try {
    await f.publish();
    await f.pg.exec(
      `CREATE FUNCTION fail_automation_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'automation.%_created' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_automation_audit BEFORE INSERT ON crm_audit_events FOR EACH ROW EXECUTE FUNCTION fail_automation_audit();`,
    );
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const lease = (await f.worker.claim())!;
      assert.ok(lease);
      try {
        await f.worker.process(lease);
      } catch (e) {
        await f.worker.fail(lease, e);
      }
      const [event] = await f.db.select().from(schema.outboxEvents);
      assert.equal(event.attempts, attempt);
      assert.equal(
        event.status,
        attempt === MAX_ATTEMPTS ? "failed" : "pending",
      );
      if (attempt < MAX_ATTEMPTS) {
        assert.ok(event.availableAt.getTime() > Date.now());
        await f.db
          .update(schema.outboxEvents)
          .set({ availableAt: new Date(0) })
          .where(eq(schema.outboxEvents.id, event.id));
      }
    }
    assert.equal((await f.db.select().from(schema.activities)).length, 0);
    assert.equal(
      (await f.db.select().from(schema.automationActions)).length,
      0,
    );
    await f.pg.exec(
      `DROP TRIGGER fail_automation_audit ON crm_audit_events; DROP FUNCTION fail_automation_audit();`,
    );
    const [event] = await f.db.select().from(schema.outboxEvents);
    await f.automation.replay(admin, f.org, event.id);
    await f.worker.tick();
    assert.equal((await f.db.select().from(schema.activities)).length, 1);
    // Completion cannot be replayed. Exhausted expired work is failed, never silently lost.
    await f.funnels.move(rep, f.org, {
      instanceId: f.enrolled.instanceId,
      targetStage: "qualified",
      expectedRevision: 1,
      commandKey: randomUUID(),
    });
    const expired = (await f.worker.claim())!;
    await f.db
      .update(schema.outboxEvents)
      .set({ attempts: MAX_ATTEMPTS, leaseUntil: new Date(0) })
      .where(eq(schema.outboxEvents.id, expired.id));
    await f.worker.claim();
    const [failed] = await f.db
      .select()
      .from(schema.outboxEvents)
      .where(
        and(
          eq(schema.outboxEvents.id, expired.id),
          eq(schema.outboxEvents.status, "failed"),
        ),
      );
    assert.ok(failed);
  } finally {
    await f.pg.close();
  }
});

test("a named recipient losing subject access and a publisher losing configure permission stop pending actions", async () => {
  const f = await fixture();
  try {
    const receiver = {
      id: "receiver",
      email: "receiver@example.com",
      emailVerified: true,
    };
    await f.ws.accept(
      receiver,
      await f.ws.invite(admin, f.org, receiver.email, "representative"),
    );
    // This user is active but cannot see the opportunity owned by rep.
    await f.publish({
      definition: { ...f.definition, recipientId: receiver.id },
    });
    await f.worker.tick();
    const [event] = await f.db.select().from(schema.outboxEvents);
    assert.equal(event.status, "failed");
    assert.match(event.lastError!, /recipient.*access/i);
    assert.equal((await f.db.select().from(schema.activities)).length, 0);
    await f.db
      .update(schema.deals)
      .set({ ownerId: receiver.id })
      .where(eq(schema.deals.id, f.dealId));
    // Original rep must retain access too; grant a shared team to both.
    const team = await f.ws.createTeam(admin, f.org, "Shared");
    await f.ws.changeTeamMember(admin, f.org, team, rep.id, false);
    await f.ws.changeTeamMember(admin, f.org, team, receiver.id, false);
    await f.ws.changeMember(admin, f.org, rep.id, "manager");
    await f.automation.replay(admin, f.org, event.id);
    await f.worker.tick();
    assert.equal(
      (await f.db.select().from(schema.activities))[0].ownerId,
      receiver.id,
    );
    const publisher = {
      id: "publisher",
      email: "publisher@example.com",
      emailVerified: true,
    };
    await f.ws.accept(
      publisher,
      await f.ws.invite(admin, f.org, publisher.email, "administrator"),
    );
    await f.automation.publish(publisher, f.org, {
      name: "Qualified notice",
      expectedRevision: 0,
      commandKey: randomUUID(),
      funnelVersionId: f.version,
      stageId: "qualified",
      definition: { ...f.definition, recipientId: receiver.id },
    });
    await f.funnels.move(rep, f.org, {
      instanceId: f.enrolled.instanceId,
      targetStage: "qualified",
      expectedRevision: 1,
      commandKey: randomUUID(),
    });
    await f.ws.changeMember(admin, f.org, publisher.id, "representative");
    await f.worker.tick();
    const failed = (await f.db.select().from(schema.outboxEvents)).find(
      (e) => e.status === "failed",
    );
    assert.ok(failed);
    assert.equal((await f.db.select().from(schema.activities)).length, 1);
  } finally {
    await f.pg.close();
  }
});
