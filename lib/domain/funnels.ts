import { and, asc, count, desc, eq, ilike, inArray, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  activities,
  deals,
  funnels,
  funnelVersions,
  funnelInstances,
  stageVisits,
  transitionEvents,
  outboxEvents,
} from "../db/schema";
import {
  AccessDenied,
  visibilityScope,
  type AccessContext,
} from "../access/policy";
import {
  definitionInput,
  layoutInput,
  standardDefinition,
  validateDefinition,
  type Stage,
  type Layout,
} from "../funnels/definition";
import {
  workspaceService,
  writeAudit,
  type Actor,
  type WorkTx,
} from "./workspace";
import type { Database } from "./database";
import { pageNumber } from "./crm";
export class FunnelError extends AccessDenied {}
export class FunnelConflict extends FunnelError {
  constructor(
    message = "This journey or draft changed. Refresh and review it before trying again.",
  ) {
    super(message);
  }
}
const uuid = z.uuid();
const revision = z.coerce.number().int().min(1);
const fingerprint = (input: unknown) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");
const command = {
  commandKey: uuid,
  source: z.enum(["ui", "domain", "api", "automation"]).default("domain"),
  correlationId: uuid.optional(),
};
export function funnelService(db: Database) {
  const ws = workspaceService(db);
  async function visibleDeal(tx: WorkTx, context: AccessContext, id: string) {
    const [deal] = await tx
      .select()
      .from(deals)
      .where(and(visibilityScope(deals, context), eq(deals.id, id)));
    if (!deal)
      throw new FunnelError(
        "Opportunity not found or outside your visibility.",
      );
    return deal;
  }
  async function definitionVersion(tx: WorkTx, org: string, id: string) {
    const [version] = await tx
      .select()
      .from(funnelVersions)
      .where(
        and(eq(funnelVersions.organizationId, org), eq(funnelVersions.id, id)),
      );
    if (!version)
      throw new FunnelError("Published version unavailable in this workspace.");
    return version;
  }
  async function configuration(actor: Actor, org: string, id: string) {
    uuid.parse(id);
    return ws.within(actor, org, "view", async (tx) => {
      const [funnel] = await tx
        .select()
        .from(funnels)
        .where(and(eq(funnels.organizationId, org), eq(funnels.id, id)));
      if (!funnel) throw new FunnelError("Funnel unavailable.");
      return funnel;
    });
  }
  async function list(
    actor: Actor,
    org: string,
    search = "",
    pageInput: unknown = 1,
    archived = false,
  ) {
    const page = pageNumber(pageInput);
    return ws.within(actor, org, "view", async (tx) => {
      const filter = and(
        eq(funnels.organizationId, org),
        archived ? undefined : isNull(funnels.archivedAt),
        ilike(
          funnels.name,
          `%${search.slice(0, 160).replace(/[\\%_]/g, "\\$&")}%`,
        ),
      );
      const [{ total }] = await tx
        .select({ total: count() })
        .from(funnels)
        .where(filter);
      const rows = await tx
        .select()
        .from(funnels)
        .where(filter)
        .orderBy(desc(funnels.createdAt), desc(funnels.id))
        .limit(50)
        .offset((page - 1) * 50);
      const versions = rows.length
        ? await tx
            .selectDistinctOn([funnelVersions.funnelId])
            .from(funnelVersions)
            .where(
              and(
                eq(funnelVersions.organizationId, org),
                inArray(
                  funnelVersions.funnelId,
                  rows.map((r) => r.id),
                ),
              ),
            )
            .orderBy(asc(funnelVersions.funnelId), desc(funnelVersions.number))
        : [];
      // Only latest metadata leaves the domain; published snapshots are loaded on demand.
      return {
        rows: rows.map((f) => ({
          ...f,
          latest: versions.find((v) => v.funnelId === f.id)
            ? {
                id: versions.find((v) => v.funnelId === f.id)!.id,
                number: versions.find((v) => v.funnelId === f.id)!.number,
              }
            : null,
        })),
        total,
        page,
        pageSize: 50,
      };
    });
  }
  async function versions(
    actor: Actor,
    org: string,
    funnelId: string,
    pageInput: unknown = 1,
  ) {
    uuid.parse(funnelId);
    const page = pageNumber(pageInput);
    return ws.within(actor, org, "view", async (tx) => {
      const filter = and(
        eq(funnelVersions.organizationId, org),
        eq(funnelVersions.funnelId, funnelId),
      );
      const [{ total }] = await tx
        .select({ total: count() })
        .from(funnelVersions)
        .where(filter);
      return {
        rows: await tx
          .select()
          .from(funnelVersions)
          .where(filter)
          .orderBy(desc(funnelVersions.number))
          .limit(50)
          .offset((page - 1) * 50),
        total,
        page,
      };
    });
  }
  async function create(actor: Actor, org: string, input: unknown) {
    const data = z
      .object({
        name: z.string().trim().min(1).max(160),
        sourceId: uuid.optional(),
      })
      .parse(input);
    return ws.within(actor, org, "configure", async (tx) => {
      let draft = standardDefinition();
      let layout: Layout = { orientation: "horizontal" };
      if (data.sourceId) {
        const [source] = await tx
          .select()
          .from(funnels)
          .where(
            and(eq(funnels.organizationId, org), eq(funnels.id, data.sourceId)),
          );
        if (!source) throw new FunnelError("Source funnel unavailable.");
        const [latest] = await tx
          .select()
          .from(funnelVersions)
          .where(
            and(
              eq(funnelVersions.organizationId, org),
              eq(funnelVersions.funnelId, source.id),
            ),
          )
          .orderBy(desc(funnelVersions.number))
          .limit(1);
        draft = latest?.definition ?? source.draft;
        layout = latest?.layout ?? source.layout;
      }
      const [after] = await tx
        .insert(funnels)
        .values({ organizationId: org, name: data.name, draft, layout })
        .returning();
      await writeAudit(
        tx,
        org,
        actor.id,
        "funnel.created",
        "funnels",
        after.id,
        null,
        { ...after, clonedFrom: data.sourceId ?? "standard-template" },
      );
      return after.id;
    });
  }
  async function saveDraft(
    actor: Actor,
    org: string,
    id: string,
    input: unknown,
  ) {
    uuid.parse(id);
    const data = z
      .object({
        name: z.string().trim().min(1).max(160),
        description: z.string().trim().max(1000),
        expectedRevision: revision,
        definition: definitionInput,
        layout: layoutInput,
      })
      .parse(input);
    return ws.within(actor, org, "configure", async (tx) => {
      const [before] = await tx
        .select()
        .from(funnels)
        .where(
          and(
            eq(funnels.organizationId, org),
            eq(funnels.id, id),
            isNull(funnels.archivedAt),
          ),
        );
      if (!before) throw new FunnelError("Active funnel unavailable.");
      if (before.draftRevision !== data.expectedRevision)
        throw new FunnelConflict();
      const [after] = await tx
        .update(funnels)
        .set({
          name: data.name,
          description: data.description,
          draft: data.definition,
          layout: data.layout,
          draftRevision: before.draftRevision + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(funnels.organizationId, org), eq(funnels.id, id)))
        .returning();
      await writeAudit(
        tx,
        org,
        actor.id,
        "funnel.draft_saved",
        "funnels",
        id,
        before,
        after,
      );
      return after.draftRevision;
    });
  }
  async function publish(
    actor: Actor,
    org: string,
    id: string,
    input: unknown,
  ) {
    uuid.parse(id);
    const data = z
      .object({ expectedRevision: revision, commandKey: uuid })
      .parse(input);
    return ws.within(actor, org, "configure", async (tx) => {
      const hash = fingerprint({ id, ...data });
      const [existing] = await tx
        .select()
        .from(funnelVersions)
        .where(
          and(
            eq(funnelVersions.organizationId, org),
            eq(funnelVersions.commandKey, data.commandKey),
          ),
        );
      if (existing) {
        if (existing.requestHash !== hash)
          throw new FunnelConflict(
            "This command key was already used for another publication.",
          );
        return existing;
      }
      const [funnel] = await tx
        .select()
        .from(funnels)
        .where(
          and(
            eq(funnels.organizationId, org),
            eq(funnels.id, id),
            isNull(funnels.archivedAt),
          ),
        );
      if (!funnel) throw new FunnelError("Active funnel unavailable.");
      if (funnel.draftRevision !== data.expectedRevision)
        throw new FunnelConflict();
      let definition;
      try {
        definition = validateDefinition(funnel.draft);
      } catch (error) {
        throw new FunnelError(
          error instanceof Error ? error.message : "Invalid draft.",
        );
      }
      const [latest] = await tx
        .select()
        .from(funnelVersions)
        .where(
          and(
            eq(funnelVersions.organizationId, org),
            eq(funnelVersions.funnelId, id),
          ),
        )
        .orderBy(desc(funnelVersions.number))
        .limit(1);
      const [version] = await tx
        .insert(funnelVersions)
        .values({
          organizationId: org,
          funnelId: id,
          number: (latest?.number ?? 0) + 1,
          definition,
          layout: funnel.layout,
          publishedBy: actor.id,
          commandKey: data.commandKey,
          requestHash: hash,
        })
        .returning();
      await writeAudit(
        tx,
        org,
        actor.id,
        "funnel.published",
        "funnels",
        id,
        null,
        {
          versionId: version.id,
          number: version.number,
          draftRevision: funnel.draftRevision,
        },
      );
      return version;
    });
  }
  async function archive(actor: Actor, org: string, id: string) {
    uuid.parse(id);
    return ws.within(actor, org, "configure", async (tx) => {
      const [before] = await tx
        .select()
        .from(funnels)
        .where(and(eq(funnels.organizationId, org), eq(funnels.id, id)));
      if (!before) throw new FunnelError("Funnel unavailable.");
      if (before.archivedAt) return;
      const [after] = await tx
        .update(funnels)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(funnels.organizationId, org), eq(funnels.id, id)))
        .returning();
      await writeAudit(
        tx,
        org,
        actor.id,
        "funnel.archived",
        "funnels",
        id,
        before,
        after,
      );
    });
  }
  async function requirements(
    tx: WorkTx,
    context: AccessContext,
    deal: typeof deals.$inferSelect,
    stage: Stage,
    side: "entry" | "exit",
  ) {
    const missing: string[] = [];
    for (const field of stage[
      side === "entry" ? "entryFields" : "exitFields"
    ]) {
      const value = deal[field];
      if (
        value === null ||
        value === "" ||
        (field === "value" && Number(value) <= 0)
      )
        missing.push(
          `${field === "expectedClose" ? "Expected close date" : field} is required by ${stage.name} (${side}).`,
        );
    }
    for (const type of stage[
      side === "entry" ? "entryActivities" : "exitActivities"
    ]) {
      const [activity] = await tx
        .select({ id: activities.id })
        .from(activities)
        .where(
          and(
            visibilityScope(activities, context),
            eq(activities.dealId, deal.id),
            eq(activities.type, type),
            eq(activities.status, "completed"),
          ),
        )
        .limit(1);
      if (!activity)
        missing.push(
          `Complete a visible ${type} activity linked directly to this opportunity (${stage.name}, ${side}).`,
        );
    }
    if (missing.length) throw new FunnelError(missing.join(" "));
  }
  async function event(
    tx: WorkTx,
    org: string,
    actor: Actor,
    instance: typeof funnelInstances.$inferSelect,
    data: { commandKey: string; source: string; correlationId?: string },
    hash: string,
    from: string | null,
    reason: string | null,
    comment: string,
    expected: number,
  ) {
    const [after] = await tx
      .insert(transitionEvents)
      .values({
        organizationId: org,
        instanceId: instance.id,
        versionId: instance.versionId,
        kind: from ? "movement" : "enrollment",
        fromStage: from,
        toStage: instance.currentStage,
        expectedRevision: expected,
        revision: instance.revision,
        actorId: actor.id,
        reason,
        comment,
        source: data.source,
        correlationId: data.correlationId ?? data.commandKey,
        commandKey: data.commandKey,
        requestHash: hash,
      })
      .returning();
    await tx.insert(outboxEvents).values({
      organizationId: org,
      transitionId: after.id,
      type: instance.state === "active" ? "stage.entered" : "journey.completed",
      payload: {
        eventId: after.id,
        instanceId: instance.id,
        dealId: instance.dealId,
        versionId: instance.versionId,
        stageId: instance.currentStage,
        actorId: actor.id,
        source: data.source,
        correlationId: after.correlationId,
        revision: instance.revision,
        outcome: instance.state,
        at: after.createdAt.toISOString(),
      },
    });
    await writeAudit(
      tx,
      org,
      actor.id,
      from ? "journey.moved" : "journey.enrolled",
      "deals",
      instance.dealId,
      from
        ? { instanceId: instance.id, stageId: from, revision: expected }
        : null,
      {
        instanceId: instance.id,
        versionId: instance.versionId,
        stageId: instance.currentStage,
        revision: instance.revision,
        outcome: instance.state,
        eventId: after.id,
        reason,
      },
    );
    return after;
  }
  async function enroll(actor: Actor, org: string, input: unknown) {
    const data = z
      .object({ dealId: uuid, versionId: uuid, ...command })
      .parse(input);
    return ws.within(actor, org, "edit", async (tx, context) => {
      const deal = await visibleDeal(tx, context, data.dealId);
      const hash = fingerprint(data);
      const [previous] = await tx
        .select()
        .from(transitionEvents)
        .where(
          and(
            eq(transitionEvents.organizationId, org),
            eq(transitionEvents.commandKey, data.commandKey),
          ),
        );
      if (previous) {
        if (previous.requestHash !== hash)
          throw new FunnelConflict(
            "Command key already used with different enrollment data.",
          );
        return {
          instanceId: previous.instanceId,
          eventId: previous.id,
          revision: previous.revision,
        };
      }
      const version = await definitionVersion(tx, org, data.versionId);
      const [funnel] = await tx
        .select()
        .from(funnels)
        .where(
          and(
            eq(funnels.organizationId, org),
            eq(funnels.id, version.funnelId),
            isNull(funnels.archivedAt),
          ),
        );
      if (!funnel)
        throw new FunnelError(
          "Archived funnels do not accept new enrollments.",
        );
      const [active] = await tx
        .select()
        .from(funnelInstances)
        .where(
          and(
            eq(funnelInstances.organizationId, org),
            eq(funnelInstances.dealId, deal.id),
            eq(funnelInstances.state, "active"),
          ),
        );
      if (active)
        throw new FunnelConflict(
          "This opportunity already has an active journey. Finish it before enrolling again.",
        );
      const entry = version.definition.stages.find((s) => s.kind === "entry")!;
      await requirements(tx, context, deal, entry, "entry");
      const now = new Date();
      const [instance] = await tx
        .insert(funnelInstances)
        .values({
          organizationId: org,
          dealId: deal.id,
          funnelId: funnel.id,
          versionId: version.id,
          currentStage: entry.id,
          enrolledAt: now,
        })
        .returning();
      await tx.insert(stageVisits).values({
        organizationId: org,
        instanceId: instance.id,
        versionId: version.id,
        stageId: entry.id,
        enteredAt: now,
        actorId: actor.id,
      });
      const recorded = await event(
        tx,
        org,
        actor,
        instance,
        data,
        hash,
        null,
        null,
        "",
        0,
      );
      return { instanceId: instance.id, eventId: recorded.id, revision: 1 };
    });
  }
  async function move(actor: Actor, org: string, input: unknown) {
    const data = z
      .object({
        instanceId: uuid,
        targetStage: z.string().min(1).max(64),
        expectedRevision: revision,
        reason: z.string().trim().max(100).default(""),
        comment: z.string().trim().max(1000).default(""),
        ...command,
      })
      .parse(input);
    return ws.within(actor, org, "edit", async (tx, context) => {
      const [instance] = await tx
        .select()
        .from(funnelInstances)
        .where(
          and(
            eq(funnelInstances.organizationId, org),
            eq(funnelInstances.id, data.instanceId),
          ),
        );
      if (!instance) throw new FunnelError("Journey unavailable.");
      const deal = await visibleDeal(tx, context, instance.dealId);
      const hash = fingerprint(data);
      const [previous] = await tx
        .select()
        .from(transitionEvents)
        .where(
          and(
            eq(transitionEvents.organizationId, org),
            eq(transitionEvents.commandKey, data.commandKey),
          ),
        );
      if (previous) {
        if (previous.requestHash !== hash)
          throw new FunnelConflict(
            "Command key already used with different movement data.",
          );
        return {
          instanceId: previous.instanceId,
          eventId: previous.id,
          revision: previous.revision,
        };
      }
      if (instance.revision !== data.expectedRevision)
        throw new FunnelConflict();
      if (instance.state !== "active")
        throw new FunnelError(
          "This journey is terminal. Its history is preserved; enroll a new journey explicitly if needed.",
        );
      const version = await definitionVersion(tx, org, instance.versionId);
      const from = version.definition.stages.find(
        (s) => s.id === instance.currentStage,
      )!;
      const to = version.definition.stages.find(
        (s) => s.id === data.targetStage,
      );
      if (
        !to ||
        !version.definition.transitions.some(
          (e) => e.from === from.id && e.to === to.id,
        )
      )
        throw new FunnelError(
          "That transition is not allowed by this journey's published version.",
        );
      if (
        to.kind === "unsuccessful" &&
        !version.definition.lossReasons.includes(data.reason)
      )
        throw new FunnelError(
          "Select a configured outcome reason for an unsuccessful exit.",
        );
      await requirements(tx, context, deal, from, "exit");
      await requirements(tx, context, deal, to, "entry");
      const now = new Date();
      const closed = await tx
        .update(stageVisits)
        .set({ exitedAt: now })
        .where(
          and(
            eq(stageVisits.organizationId, org),
            eq(stageVisits.instanceId, instance.id),
            isNull(stageVisits.exitedAt),
          ),
        )
        .returning();
      if (closed.length !== 1)
        throw new FunnelConflict(
          "The current visit is inconsistent. Ask an administrator to inspect this journey.",
        );
      const state =
        to.kind === "successful" || to.kind === "unsuccessful"
          ? to.kind
          : "active";
      const [after] = await tx
        .update(funnelInstances)
        .set({
          currentStage: to.id,
          state,
          revision: instance.revision + 1,
          completedAt: state === "active" ? null : now,
        })
        .where(
          and(
            eq(funnelInstances.organizationId, org),
            eq(funnelInstances.id, instance.id),
            eq(funnelInstances.revision, instance.revision),
          ),
        )
        .returning();
      if (!after) throw new FunnelConflict();
      await tx.insert(stageVisits).values({
        organizationId: org,
        instanceId: instance.id,
        versionId: version.id,
        stageId: to.id,
        enteredAt: now,
        exitedAt: state === "active" ? null : now,
        actorId: actor.id,
      });
      const recorded = await event(
        tx,
        org,
        actor,
        after,
        data,
        hash,
        from.id,
        to.kind === "unsuccessful" ? data.reason : null,
        data.comment,
        instance.revision,
      );
      return {
        instanceId: instance.id,
        eventId: recorded.id,
        revision: after.revision,
      };
    });
  }
  async function board(
    actor: Actor,
    org: string,
    versionId: string,
    search = "",
    pageInput: unknown = 1,
  ) {
    uuid.parse(versionId);
    const page = pageNumber(pageInput);
    return ws.within(actor, org, "view", async (tx, context) => {
      const version = await definitionVersion(tx, org, versionId);
      const [funnel] = await tx
        .select()
        .from(funnels)
        .where(
          and(
            eq(funnels.organizationId, org),
            eq(funnels.id, version.funnelId),
          ),
        );
      const filter = and(
        visibilityScope(deals, context),
        eq(funnelInstances.organizationId, org),
        eq(funnelInstances.versionId, versionId),
        ilike(
          deals.name,
          `%${search.slice(0, 160).replace(/[\\%_]/g, "\\$&")}%`,
        ),
      );
      const [{ total }] = await tx
        .select({ total: count() })
        .from(funnelInstances)
        .innerJoin(
          deals,
          and(
            eq(deals.organizationId, funnelInstances.organizationId),
            eq(deals.id, funnelInstances.dealId),
          ),
        )
        .where(filter);
      const rows = await tx
        .select({ instance: funnelInstances, deal: deals, visit: stageVisits })
        .from(funnelInstances)
        .innerJoin(
          deals,
          and(
            eq(deals.organizationId, funnelInstances.organizationId),
            eq(deals.id, funnelInstances.dealId),
          ),
        )
        .innerJoin(
          stageVisits,
          and(
            eq(stageVisits.organizationId, funnelInstances.organizationId),
            eq(stageVisits.instanceId, funnelInstances.id),
            eq(stageVisits.stageId, funnelInstances.currentStage),
          ),
        )
        .where(filter)
        .orderBy(desc(funnelInstances.enrolledAt), desc(funnelInstances.id))
        .limit(50)
        .offset((page - 1) * 50);
      return { funnel, version, rows, total, page, asOf: new Date() };
    });
  }
  async function journeys(
    actor: Actor,
    org: string,
    dealId: string,
    pageInput: unknown = 1,
  ) {
    uuid.parse(dealId);
    const page = pageNumber(pageInput);
    return ws.within(actor, org, "view", async (tx, context) => {
      await visibleDeal(tx, context, dealId);
      const filter = and(
        eq(funnelInstances.organizationId, org),
        eq(funnelInstances.dealId, dealId),
      );
      const [{ total }] = await tx
        .select({ total: count() })
        .from(funnelInstances)
        .where(filter);
      const rows = await tx
        .select({
          instance: funnelInstances,
          version: funnelVersions,
          funnel: funnels,
        })
        .from(funnelInstances)
        .innerJoin(
          funnelVersions,
          and(
            eq(funnelVersions.organizationId, org),
            eq(funnelVersions.id, funnelInstances.versionId),
          ),
        )
        .innerJoin(
          funnels,
          and(
            eq(funnels.organizationId, org),
            eq(funnels.id, funnelInstances.funnelId),
          ),
        )
        .where(filter)
        .orderBy(desc(funnelInstances.enrolledAt), desc(funnelInstances.id))
        .limit(50)
        .offset((page - 1) * 50);
      return { rows, total, page };
    });
  }
  async function history(
    actor: Actor,
    org: string,
    id: string,
    pageInput: unknown = 1,
  ) {
    uuid.parse(id);
    const page = pageNumber(pageInput);
    return ws.within(actor, org, "view", async (tx, context) => {
      const [instance] = await tx
        .select()
        .from(funnelInstances)
        .where(
          and(
            eq(funnelInstances.organizationId, org),
            eq(funnelInstances.id, id),
          ),
        );
      if (!instance) throw new FunnelError("Journey unavailable.");
      const deal = await visibleDeal(tx, context, instance.dealId);
      const version = await definitionVersion(tx, org, instance.versionId);
      const filter = and(
        eq(transitionEvents.organizationId, org),
        eq(transitionEvents.instanceId, id),
      );
      const [{ total }] = await tx
        .select({ total: count() })
        .from(transitionEvents)
        .where(filter);
      const events = await tx
        .select()
        .from(transitionEvents)
        .where(filter)
        .orderBy(asc(transitionEvents.revision))
        .limit(50)
        .offset((page - 1) * 50);
      const visits = await tx
        .select()
        .from(stageVisits)
        .where(
          and(
            eq(stageVisits.organizationId, org),
            eq(stageVisits.instanceId, id),
          ),
        )
        .orderBy(
          desc(stageVisits.baseline),
          asc(stageVisits.enteredAt),
          asc(stageVisits.id),
        )
        .limit(50)
        .offset((page - 1) * 50);
      const [{ total: visitTotal }] = await tx
        .select({ total: count() })
        .from(stageVisits)
        .where(
          and(
            eq(stageVisits.organizationId, org),
            eq(stageVisits.instanceId, id),
          ),
        );
      return {
        instance,
        deal,
        version,
        events,
        visits,
        page,
        total: Math.max(total, visitTotal),
      };
    });
  }
  return {
    list,
    configuration,
    versions,
    create,
    saveDraft,
    publish,
    archive,
    enroll,
    move,
    board,
    journeys,
    history,
  };
}
