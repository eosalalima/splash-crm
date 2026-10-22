import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { funnelService, FunnelConflict } from "../lib/domain/funnels";
import { crmService } from "../lib/domain/crm";
import { workspaceService } from "../lib/domain/workspace";
import {
  standardDefinition,
  stageTiming,
  validateDefinition,
  orderedTransitions,
} from "../lib/funnels/definition";
const admin = { id: "admin", email: "admin@example.com", emailVerified: true },
  other = { id: "other", email: "other@example.com", emailVerified: true },
  rep = { id: "rep", email: "rep@example.com", emailVerified: true },
  reader = { id: "reader", email: "reader@example.com", emailVerified: true };
const deal = (name = "Opportunity", extra = {}) => ({
  name,
  value: "25000",
  stage: "Lead",
  companyId: "",
  ...extra,
});
const key = () => randomUUID();
async function fixture() {
  const pg = new PGlite();
  for (const file of [
    "0000_talented_blade",
    "0001_shared_workspace",
    "0002_crm_operating_workflow",
    "0003_funnel_design_execution",
  ])
    await pg.exec(readFileSync(`drizzle/${file}.sql`, "utf8"));
  const db = drizzle(pg, { schema }),
    ws = workspaceService(db),
    f = funnelService(db),
    crm = crmService(db);
  const [a] = await ws.available(admin),
    [b] = await ws.available(other);
  const id = await f.create(admin, a.id, { name: "Standard sales" });
  const version = await f.publish(admin, a.id, id, {
    expectedRevision: 1,
    commandKey: key(),
  });
  return { pg, db, ws, f, crm, org: a.id, foreign: b.id, id, version };
}
async function draft(
  f: Awaited<ReturnType<typeof fixture>>,
  definition = standardDefinition(),
  extra = {},
) {
  const current = await f.f.configuration(admin, f.org, f.id);
  return f.f.saveDraft(admin, f.org, f.id, {
    name: current.name,
    description: current.description,
    expectedRevision: current.draftRevision,
    definition,
    layout: current.layout,
    ...extra,
  });
}

test("published definitions validate ordered graph, gates, probabilities and terminal structure", () => {
  const base = standardDefinition();
  assert.deepEqual(validateDefinition(base), base);
  assert.deepEqual(
    base.stages.map((s) => s.probability),
    [10, 30, 60, 100, 0],
  );
  assert.deepEqual(
    base.stages.map((s) => s.targetHours),
    [48, 72, 120, 0, 0],
  );
  assert.deepEqual(base.stages[2].entryFields, ["expectedClose"]);
  assert.deepEqual(base.stages[2].entryActivities, []);
  for (const mutate of [
    (d: typeof base) => {
      d.stages[1].id = d.stages[0].id;
    },
    (d: typeof base) => {
      d.stages[1].name = d.stages[0].name;
    },
    (d: typeof base) => {
      d.transitions.pop();
    },
    (d: typeof base) => {
      d.transitions.push({ from: "won", to: "lead" });
    },
    (d: typeof base) => {
      d.transitions[0].to = "missing";
    },
    (d: typeof base) => {
      d.stages[3].probability = 90;
    },
    (d: typeof base) => {
      d.stages[0].kind = "normal";
    },
    (d: typeof base) => {
      d.lossReasons.push(d.lossReasons[0]);
    },
  ]) {
    const data = structuredClone(base);
    mutate(data);
    assert.throws(() => validateDefinition(data));
  }
  assert.throws(() =>
    validateDefinition({
      ...base,
      stages: base.stages.map((s, i) =>
        i === 1 ? { ...s, entryFields: ["arbitraryCode"] } : s,
      ),
    }),
  );
});

test("legacy migration preserves IDs/values and unknown-entry baselines without fabricated transitions or automation", async () => {
  const pg = new PGlite();
  try {
    for (const file of [
      "0000_talented_blade",
      "0001_shared_workspace",
      "0002_crm_operating_workflow",
    ])
      await pg.exec(readFileSync(`drizzle/${file}.sql`, "utf8"));
    const db = drizzle(pg, { schema });
    const ws = workspaceService(db),
      crm = crmService(db);
    const [org] = await ws.available(admin);
    const ids = [];
    for (const stage of ["Lead", "Qualified", "Proposal", "Won", "Lost"])
      ids.push(await crm.save(admin, org.id, "deals", deal(stage, { stage })));
    const deleted = await crm.save(admin, org.id, "deals", deal("Deleted"));
    await db
      .update(schema.deals)
      .set({ deletedAt: new Date() })
      .where(eq(schema.deals.id, deleted));
    await pg.transaction((tx) =>
      tx.exec(readFileSync("drizzle/0003_funnel_design_execution.sql", "utf8")),
    );
    const instances = await db.select().from(schema.funnelInstances);
    assert.equal(instances.length, 5);
    assert.deepEqual(new Set(instances.map((i) => i.dealId)), new Set(ids));
    assert.equal(instances.filter((i) => i.state === "active").length, 3);
    const visits = await db.select().from(schema.stageVisits);
    assert.ok(visits.every((v) => v.enteredAt === null && v.baseline === 1));
    assert.equal((await db.select().from(schema.transitionEvents)).length, 0);
    assert.equal((await db.select().from(schema.outboxEvents)).length, 0);
    const [legacy] = await db.select().from(schema.funnels);
    assert.ok(legacy.archivedAt);
    assert.equal(legacy.kind, "legacy");
    assert.ok(
      (await db.select().from(schema.deals)).every((d) => d.value === 2500000),
    );
    const version = (await db.select().from(schema.funnelVersions))[0];
    validateDefinition(version.definition);
    const service = funnelService(db);
    const active = instances.find((i) => i.currentStage === "lead")!;
    await service.move(admin, org.id, {
      instanceId: active.id,
      targetStage: "qualified",
      expectedRevision: 1,
      commandKey: key(),
    });
    const history = await service.history(admin, org.id, active.id);
    assert.equal(history.events.length, 1);
    assert.equal(history.visits.find((v) => v.baseline)!.enteredAt, null);
  } finally {
    await pg.close();
  }
});

test("publication is immutable/idempotent, drafts conflict, clones isolate, archived versions keep journeys pinned", async () => {
  const f = await fixture();
  try {
    const publishedKey = key();
    const original = await f.f.publish(admin, f.org, f.id, {
      expectedRevision: 1,
      commandKey: publishedKey,
    });
    assert.deepEqual(
      await f.f.publish(admin, f.org, f.id, {
        expectedRevision: 1,
        commandKey: publishedKey,
      }),
      original,
    );
    const definition = standardDefinition();
    definition.stages[2].name = "Offer";
    definition.stages[2].entryFields = [];
    const revision = await draft(f, definition, {
      layout: { orientation: "vertical" },
    });
    await assert.rejects(
      f.f.saveDraft(admin, f.org, f.id, {
        name: "Stale",
        description: "",
        expectedRevision: 1,
        definition,
        layout: { orientation: "horizontal" },
      }),
      FunnelConflict,
    );
    const v3 = await f.f.publish(admin, f.org, f.id, {
      expectedRevision: revision,
      commandKey: key(),
    });
    assert.equal(v3.layout.orientation, "vertical");
    assert.equal(
      (await f.f.board(admin, f.org, f.version.id)).version.definition.stages[2]
        .name,
      "Proposal",
    );
    const id = await f.crm.save(admin, f.org, "deals", deal());
    const enrolled = await f.f.enroll(admin, f.org, {
      dealId: id,
      versionId: f.version.id,
      commandKey: key(),
    });
    const cloned = await f.f.create(admin, f.org, {
      name: "Clone",
      sourceId: f.id,
    });
    const copy = await f.f.configuration(admin, f.org, cloned);
    assert.equal(copy.draft.stages[2].name, "Offer");
    assert.equal((await f.f.versions(admin, f.org, cloned)).total, 0);
    await f.f.archive(admin, f.org, f.id);
    await assert.rejects(
      f.f.enroll(admin, f.org, {
        dealId: await f.crm.save(admin, f.org, "deals", deal("Another")),
        versionId: v3.id,
        commandKey: key(),
      }),
      /Archived/,
    );
    await f.f.move(admin, f.org, {
      instanceId: enrolled.instanceId,
      targetStage: "qualified",
      expectedRevision: 1,
      commandKey: key(),
    });
    await assert.rejects(
      f.f.move(admin, f.org, {
        instanceId: enrolled.instanceId,
        targetStage: "proposal",
        expectedRevision: 2,
        commandKey: key(),
      }),
      /Expected close date/,
    );
    for (const command of [
      () => f.db.update(schema.funnelVersions).set({ number: 99 }),
      () => f.db.delete(schema.funnelVersions),
      () => f.pg.exec("TRUNCATE crm_funnel_versions CASCADE"),
    ])
      await assert.rejects(command());
    const invalid = standardDefinition();
    invalid.transitions = [];
    await draft({ ...f, id: cloned }, invalid);
    await assert.rejects(
      f.f.publish(admin, f.org, cloned, {
        expectedRevision: 2,
        commandKey: key(),
      }),
      /transitions/,
    );
    assert.equal((await f.f.versions(admin, f.org, cloned)).total, 0);
  } finally {
    await f.pg.close();
  }
});

test("enrollment and movement enforce gates, explicit reasons, one active instance and repeat-safe commands", async () => {
  const f = await fixture();
  try {
    const definition = standardDefinition();
    definition.stages[1].exitFields = ["notes"];
    definition.stages[2].entryActivities = ["call"];
    const revision = await draft(f, definition);
    const version = await f.f.publish(admin, f.org, f.id, {
      expectedRevision: revision,
      commandKey: key(),
    });
    const id = await f.crm.save(admin, f.org, "deals", deal());
    const enrollCommand = {
      dealId: id,
      versionId: version.id,
      commandKey: key(),
    };
    const start = await f.f.enroll(admin, f.org, enrollCommand);
    assert.deepEqual(await f.f.enroll(admin, f.org, enrollCommand), start);
    await assert.rejects(
      f.f.enroll(admin, f.org, { ...enrollCommand, commandKey: key() }),
      /active journey/,
    );
    const first = {
      instanceId: start.instanceId,
      targetStage: "qualified",
      expectedRevision: 1,
      commandKey: key(),
      correlationId: key(),
      source: "ui",
    };
    const result = await f.f.move(admin, f.org, first);
    assert.deepEqual(await f.f.move(admin, f.org, first), result);
    await assert.rejects(
      f.f.move(admin, f.org, {
        ...first,
        targetStage: "lost",
        reason: "Other",
      }),
      /Command key/,
    );
    await assert.rejects(
      f.f.move(admin, f.org, {
        instanceId: start.instanceId,
        targetStage: "proposal",
        expectedRevision: 2,
        commandKey: key(),
      }),
      /notes/,
    );
    await f.crm.save(
      admin,
      f.org,
      "deals",
      deal("Opportunity", { notes: "Ready", expectedClose: "2026-12-01" }),
      id,
    );
    await assert.rejects(
      f.f.move(admin, f.org, {
        instanceId: start.instanceId,
        targetStage: "proposal",
        expectedRevision: 2,
        commandKey: key(),
      }),
      /call activity/,
    );
    const activity = await f.crm.save(admin, f.org, "activities", {
      name: "Call",
      type: "call",
      status: "completed",
      outcome: "Agreed next steps",
      dealId: id,
    });
    await f.crm.remove(admin, f.org, "activities", activity);
    await assert.rejects(
      f.f.move(admin, f.org, {
        instanceId: start.instanceId,
        targetStage: "proposal",
        expectedRevision: 2,
        commandKey: key(),
      }),
      /call activity/,
    );
    await f.crm.save(admin, f.org, "activities", {
      name: "Call again",
      type: "call",
      status: "completed",
      outcome: "Confirmed",
      dealId: id,
    });
    await f.f.move(admin, f.org, {
      instanceId: start.instanceId,
      targetStage: "proposal",
      expectedRevision: 2,
      commandKey: key(),
    });
    await assert.rejects(
      f.f.move(admin, f.org, {
        instanceId: start.instanceId,
        targetStage: "lost",
        expectedRevision: 3,
        commandKey: key(),
        reason: "Unconfigured",
      }),
      /configured outcome reason/,
    );
    await f.f.move(admin, f.org, {
      instanceId: start.instanceId,
      targetStage: "lost",
      expectedRevision: 3,
      commandKey: key(),
      reason: "Budget withdrawn",
      comment: "Next year",
    });
    const history = await f.f.history(admin, f.org, start.instanceId);
    assert.equal(history.instance.state, "unsuccessful");
    assert.equal(history.events.length, 4);
    assert.equal(history.events[1].correlationId, first.correlationId);
    assert.equal(history.events[3].reason, "Budget withdrawn");
    assert.equal(history.deal.status, "open");
    assert.ok(history.visits.every((v) => v.exitedAt));
    assert.equal((await f.db.select().from(schema.outboxEvents)).length, 4);
    await assert.rejects(
      f.f.move(admin, f.org, {
        instanceId: start.instanceId,
        targetStage: "won",
        expectedRevision: 4,
        commandKey: key(),
      }),
      /terminal/,
    );
    const next = await f.f.enroll(admin, f.org, {
      dealId: id,
      versionId: version.id,
      commandKey: key(),
    });
    assert.notEqual(next.instanceId, start.instanceId);
  } finally {
    await f.pg.close();
  }
});

test("audit/outbox failures roll back visit closure, revision, transition and queued event together", async () => {
  const f = await fixture();
  try {
    const id = await f.crm.save(admin, f.org, "deals", deal());
    const enrolled = await f.f.enroll(admin, f.org, {
      dealId: id,
      versionId: f.version.id,
      commandKey: key(),
    });
    const input = {
      instanceId: enrolled.instanceId,
      targetStage: "qualified",
      expectedRevision: 1,
      commandKey: key(),
    };
    for (const table of ["crm_audit_events", "crm_outbox_events"]) {
      await f.pg.exec(
        `CREATE FUNCTION fail_funnel_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER fail_funnel_write BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_funnel_write();`,
      );
      try {
        await assert.rejects(f.f.move(admin, f.org, input));
      } finally {
        await f.pg.exec(
          `DROP TRIGGER fail_funnel_write ON ${table}; DROP FUNCTION fail_funnel_write();`,
        );
      }
      const h = await f.f.history(admin, f.org, enrolled.instanceId);
      assert.equal(h.instance.revision, 1);
      assert.equal(h.visits.length, 1);
      assert.equal(h.visits[0].exitedAt, null);
      assert.equal(h.events.length, 1);
      assert.equal((await f.db.select().from(schema.outboxEvents)).length, 1);
    }
    await f.f.move(admin, f.org, input);
    const h = await f.f.history(admin, f.org, enrolled.instanceId);
    assert.equal(h.instance.revision, 2);
    assert.equal(h.events.length, 2);
    await assert.rejects(
      f.db.update(schema.transitionEvents).set({ comment: "Rewrite" }),
    );
    await assert.rejects(f.db.delete(schema.transitionEvents));
    await assert.rejects(f.pg.exec("TRUNCATE crm_transition_events CASCADE"));
    await assert.rejects(
      f.db.update(schema.stageVisits).set({ actorId: "intruder" }),
    );
    await assert.rejects(f.db.delete(schema.stageVisits));
    await assert.rejects(f.pg.exec("TRUNCATE crm_stage_visits"));
    await assert.rejects(
      f.db
        .update(schema.funnelInstances)
        .set({ versionId: key() })
        .where(eq(schema.funnelInstances.id, enrolled.instanceId)),
    );
  } finally {
    await f.pg.close();
  }
});

test("scoped board/history/movement, tenant constraints and revoked memberships fail closed", async () => {
  const f = await fixture();
  try {
    await f.ws.accept(
      rep,
      await f.ws.invite(admin, f.org, rep.email, "representative"),
    );
    await f.ws.accept(
      reader,
      await f.ws.invite(admin, f.org, reader.email, "read_only"),
    );
    const own = await f.crm.save(rep, f.org, "deals", deal("Own"));
    const hidden = await f.crm.save(admin, f.org, "deals", deal("Hidden"));
    const ownJourney = await f.f.enroll(rep, f.org, {
      dealId: own,
      versionId: f.version.id,
      commandKey: key(),
    });
    const hiddenJourney = await f.f.enroll(admin, f.org, {
      dealId: hidden,
      versionId: f.version.id,
      commandKey: key(),
    });
    assert.equal((await f.f.board(rep, f.org, f.version.id)).total, 1);
    assert.equal(
      (await f.f.board(rep, f.org, f.version.id, "Hidden")).total,
      0,
    );
    assert.equal((await f.f.board(reader, f.org, f.version.id)).total, 2);
    await assert.rejects(f.f.history(rep, f.org, hiddenJourney.instanceId));
    await assert.rejects(
      f.f.move(rep, f.org, {
        instanceId: hiddenJourney.instanceId,
        targetStage: "qualified",
        expectedRevision: 1,
        commandKey: key(),
      }),
    );
    await assert.rejects(
      f.f.move(reader, f.org, {
        instanceId: ownJourney.instanceId,
        targetStage: "qualified",
        expectedRevision: 1,
        commandKey: key(),
      }),
    );
    await assert.rejects(f.f.create(rep, f.org, { name: "Forbidden" }));
    await assert.rejects(
      f.f.publish(reader, f.org, f.id, {
        expectedRevision: 1,
        commandKey: key(),
      }),
    );
    await assert.rejects(f.f.board(other, f.foreign, f.version.id));
    await assert.rejects(
      f.db.insert(schema.funnelInstances).values({
        organizationId: f.foreign,
        dealId: own,
        funnelId: f.id,
        versionId: f.version.id,
        currentStage: "lead",
      }),
    );
    await assert.rejects(
      f.crm.save(rep, f.org, "deals", deal("Own", { stage: "Qualified" }), own),
      /pipeline board/,
    );
    await assert.rejects(
      f.crm.remove(rep, f.org, "deals", own),
      /active journey/,
    );
    await f.ws.changeMember(admin, f.org, rep.id, "representative", true);
    await assert.rejects(f.f.history(rep, f.org, ownJourney.instanceId));
    await assert.rejects(
      f.f.move(rep, f.org, {
        instanceId: ownJourney.instanceId,
        targetStage: "qualified",
        expectedRevision: 1,
        commandKey: key(),
      }),
    );
  } finally {
    await f.pg.close();
  }
});

test("board pagination is deterministic and escaped search excludes other tenants", async () => {
  const f = await fixture();
  try {
    const records = await f.db
      .insert(schema.deals)
      .values(
        Array.from({ length: 55 }, (_, i) => ({
          organizationId: f.org,
          ownerId: admin.id,
          name: i === 0 ? "Literal %_ opportunity" : `Opportunity ${i}`,
        })),
      )
      .returning();
    const instances = await f.db
      .insert(schema.funnelInstances)
      .values(
        records.map((d) => ({
          organizationId: f.org,
          dealId: d.id,
          funnelId: f.id,
          versionId: f.version.id,
          currentStage: "lead",
        })),
      )
      .returning();
    await f.db.insert(schema.stageVisits).values(
      instances.map((i) => ({
        organizationId: f.org,
        instanceId: i.id,
        versionId: f.version.id,
        stageId: "lead",
        enteredAt: new Date(),
      })),
    );
    const a = await f.f.board(admin, f.org, f.version.id, "", 1),
      b = await f.f.board(admin, f.org, f.version.id, "", 2);
    assert.equal(a.total, 55);
    assert.equal(a.rows.length, 50);
    assert.equal(b.rows.length, 5);
    assert.ok(
      !a.rows.some((x) => b.rows.some((y) => x.instance.id === y.instance.id)),
    );
    assert.deepEqual(
      (await f.f.board(admin, f.org, f.version.id, "", 1)).rows.map(
        (r) => r.instance.id,
      ),
      a.rows.map((r) => r.instance.id),
    );
    assert.equal((await f.f.board(admin, f.org, f.version.id, "%_")).total, 1);
    const third = standardDefinition();
    third.stages.splice(2, 0, {
      ...third.stages[1],
      id: "discovery",
      name: "Discovery",
    });
    third.transitions = orderedTransitions(third.stages);
    validateDefinition(third);
  } finally {
    await f.pg.close();
  }
});

test("team boards and required activities recheck current visibility rather than using hidden completed work", async () => {
  const f = await fixture();
  try {
    const manager = {
      id: "manager",
      email: "manager@example.com",
      emailVerified: true,
    };
    for (const [actor, role] of [
      [rep, "representative"],
      [manager, "manager"],
    ] as const)
      await f.ws.accept(
        actor,
        await f.ws.invite(admin, f.org, actor.email, role),
      );
    const team = await f.ws.createTeam(admin, f.org, "Sales");
    await f.ws.changeTeamMember(admin, f.org, team, rep.id);
    await f.ws.changeTeamMember(admin, f.org, team, manager.id);
    const definition = standardDefinition();
    definition.stages[1].entryActivities = ["call"];
    const rev = await draft(f, definition);
    const version = await f.f.publish(admin, f.org, f.id, {
      expectedRevision: rev,
      commandKey: key(),
    });
    const own = await f.crm.save(rep, f.org, "deals", deal("Team opportunity"));
    const hidden = await f.crm.save(admin, f.org, "deals", deal("Other team"));
    const start = await f.f.enroll(rep, f.org, {
      dealId: own,
      versionId: version.id,
      commandKey: key(),
    });
    await f.f.enroll(admin, f.org, {
      dealId: hidden,
      versionId: version.id,
      commandKey: key(),
    });
    assert.equal((await f.f.board(manager, f.org, version.id)).total, 1);
    await f.crm.save(admin, f.org, "activities", {
      name: "Hidden call",
      type: "call",
      status: "completed",
      outcome: "Done",
      dealId: own,
    });
    await assert.rejects(
      f.f.move(rep, f.org, {
        instanceId: start.instanceId,
        targetStage: "qualified",
        expectedRevision: 1,
        commandKey: key(),
      }),
      /visible call/,
    );
    await assert.rejects(
      f.f.move(manager, f.org, {
        instanceId: start.instanceId,
        targetStage: "qualified",
        expectedRevision: 1,
        commandKey: key(),
      }),
      /visible call/,
    );
    await f.crm.save(rep, f.org, "activities", {
      name: "Visible call",
      type: "call",
      status: "completed",
      outcome: "Done",
      dealId: own,
    });
    await f.f.move(manager, f.org, {
      instanceId: start.instanceId,
      targetStage: "qualified",
      expectedRevision: 1,
      commandKey: key(),
    });
    await f.ws.changeTeamMember(admin, f.org, team, rep.id, true);
    assert.equal((await f.f.board(manager, f.org, version.id)).total, 0);
    await assert.rejects(f.f.history(manager, f.org, start.instanceId));
  } finally {
    await f.pg.close();
  }
});

test("aging uses strict elapsed-hour thresholds and never invents an age for unknown baselines", () => {
  const entered = "2026-10-20T16:00:00Z";
  assert.deepEqual(stageTiming(entered, "2026-10-22T16:00:00Z", 48, true), {
    hours: 48,
    overdue: false,
  });
  assert.equal(
    stageTiming(entered, "2026-10-22T16:00:01Z", 48, true).overdue,
    true,
  );
  assert.equal(
    stageTiming(entered, "2026-10-23T16:00:00Z", 0, true).overdue,
    false,
  );
  assert.equal(
    stageTiming(entered, "2026-10-23T16:00:00Z", 48, false).overdue,
    false,
  );
  assert.deepEqual(stageTiming(null, "2026-10-23T16:00:00Z", 48, true), {
    hours: null,
    overdue: false,
  });
});
