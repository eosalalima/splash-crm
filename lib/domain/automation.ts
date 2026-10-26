import { and, desc, ilike, inArray, eq, isNull, sql, count } from "drizzle-orm";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import {
  automations,
  automationVersions,
  automationRuns,
  automationActions,
  outboxEvents,
  funnels,
  funnelVersions,
  notifications,
  deals,
} from "../db/schema";
import { automationDefinitionInput } from "../automation/definition";
import { AccessDenied, visibilityScope } from "../access/policy";
import {
  authorizeWorkspace,
  workspaceService,
  writeAudit,
  type Actor,
} from "./workspace";
import { pageNumber } from "./crm";
import type { Database } from "./database";

const publicationInput = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(160),
    expectedRevision: z.coerce.number().int().min(0),
    commandKey: z.uuid(),
    funnelVersionId: z.uuid(),
    stageId: z.string().min(1).max(64),
    definition: automationDefinitionInput,
  })
  .strict();
export function automationService(db: Database) {
  const ws = workspaceService(db);
  async function publish(actor: Actor, org: string, input: unknown) {
    const data = publicationInput.parse(input);
    return ws.within(actor, org, "configure", async (tx) => {
      const [existingCommand] = await tx
        .select()
        .from(automationVersions)
        .where(
          and(
            eq(automationVersions.organizationId, org),
            eq(automationVersions.commandKey, data.commandKey),
          ),
        );
      if (existingCommand) {
        const same =
          existingCommand.requestHash ===
          createHash("sha256").update(JSON.stringify(data)).digest("hex");
        if (!same)
          throw new AccessDenied(
            "Command key already used with different publication data.",
          );
        return existingCommand.automationId;
      }
      const [version] = await tx
        .select()
        .from(funnelVersions)
        .where(
          and(
            eq(funnelVersions.organizationId, org),
            eq(funnelVersions.id, data.funnelVersionId),
          ),
        );
      if (
        !version ||
        !version.definition.stages.some((s) => s.id === data.stageId)
      )
        throw new AccessDenied(
          "Select a published funnel version and a stage in that version.",
        );
      // Recipient must currently be able to see opportunities; execution checks the actual subject again.
      await authorizeWorkspace(
        tx,
        { id: data.definition.recipientId, email: "" },
        org,
        data.definition.actions.some((a) => a.kind === "task")
          ? "create"
          : "view",
      );
      let id = data.id;
      if (id) {
        const [workflow] = await tx
          .select()
          .from(automations)
          .where(
            and(eq(automations.organizationId, org), eq(automations.id, id)),
          );
        if (
          !workflow ||
          workflow.archivedAt ||
          workflow.revision !== data.expectedRevision
        )
          throw new AccessDenied(
            "Workflow changed or is archived. Refresh before publishing.",
          );
        await tx
          .update(automations)
          .set({
            name: data.name,
            revision: workflow.revision + 1,
            updatedAt: new Date(),
          })
          .where(
            and(eq(automations.organizationId, org), eq(automations.id, id)),
          );
      } else {
        if (data.expectedRevision !== 0)
          throw new AccessDenied("A new workflow must start at revision zero.");
        const [active] = await tx
          .select({ total: count() })
          .from(automations)
          .where(
            and(
              eq(automations.organizationId, org),
              isNull(automations.archivedAt),
            ),
          );
        if (active.total >= 100)
          throw new AccessDenied(
            "This workspace has 100 active workflows. Archive an unused workflow before creating another.",
          );
        id = randomUUID();
        await tx
          .insert(automations)
          .values({ id, organizationId: org, name: data.name, revision: 1 });
      }
      const [published] = await tx
        .insert(automationVersions)
        .values({
          organizationId: org,
          automationId: id,
          number: data.expectedRevision + 1,
          funnelVersionId: data.funnelVersionId,
          stageId: data.stageId,
          definition: data.definition,
          publishedBy: actor.id,
          commandKey: data.commandKey,
          requestHash: createHash("sha256")
            .update(JSON.stringify(data))
            .digest("hex"),
        })
        .returning();
      await writeAudit(
        tx,
        org,
        actor.id,
        "automation.published",
        "automation",
        id,
        null,
        { versionId: published.id, number: published.number, name: data.name },
      );
      return id;
    });
  }
  async function archive(actor: Actor, org: string, id: string) {
    z.uuid().parse(id);
    return ws.within(actor, org, "configure", async (tx) => {
      const [row] = await tx
        .update(automations)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(automations.organizationId, org),
            eq(automations.id, id),
            isNull(automations.archivedAt),
          ),
        )
        .returning();
      if (!row)
        throw new AccessDenied("Workflow unavailable or already archived.");
      await writeAudit(
        tx,
        org,
        actor.id,
        "automation.archived",
        "automation",
        id,
        null,
        { archived: true },
      );
    });
  }
  async function overview(actor: Actor, org: string, pageInput: unknown = 1) {
    const page = pageNumber(pageInput);
    return ws.within(actor, org, "configure", async (tx) => {
      const workflows = await tx
        .select({ workflow: automations, version: automationVersions })
        .from(automations)
        .innerJoin(
          automationVersions,
          and(
            eq(automationVersions.organizationId, org),
            eq(automationVersions.automationId, automations.id),
            eq(automationVersions.number, automations.revision),
          ),
        )
        .where(eq(automations.organizationId, org))
        .orderBy(desc(automations.createdAt), desc(automations.id))
        .limit(25)
        .offset((page - 1) * 25);
      const versions = await tx
        .select()
        .from(automationVersions)
        .where(eq(automationVersions.organizationId, org))
        .orderBy(
          desc(automationVersions.createdAt),
          desc(automationVersions.id),
        )
        .limit(50)
        .offset((page - 1) * 50);
      const events = await tx
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.organizationId, org))
        .orderBy(desc(outboxEvents.createdAt), desc(outboxEvents.id))
        .limit(25)
        .offset((page - 1) * 25);
      const runs = await tx
        .select()
        .from(automationRuns)
        .where(eq(automationRuns.organizationId, org))
        .orderBy(desc(automationRuns.createdAt), desc(automationRuns.id))
        .limit(50)
        .offset((page - 1) * 50);
      const actions = await tx
        .select()
        .from(automationActions)
        .where(eq(automationActions.organizationId, org))
        .orderBy(desc(automationActions.createdAt), desc(automationActions.id))
        .limit(50)
        .offset((page - 1) * 50);
      const queue = await tx
        .select({
          status: outboxEvents.status,
          total: count(),
          oldest: sql<Date | null>`min(${outboxEvents.createdAt})`,
        })
        .from(outboxEvents)
        .where(eq(outboxEvents.organizationId, org))
        .groupBy(outboxEvents.status);
      const triggerVersions = workflows.length
        ? await tx
            .select()
            .from(funnelVersions)
            .where(
              and(
                eq(funnelVersions.organizationId, org),
                inArray(
                  funnelVersions.id,
                  workflows.map((w) => w.version.funnelVersionId),
                ),
              ),
            )
        : [];
      return {
        workflows,
        versions,
        events,
        runs,
        actions,
        queue,
        page,
        triggerVersions,
      };
    });
  }
  async function replay(actor: Actor, org: string, id: string) {
    z.uuid().parse(id);
    return ws.within(actor, org, "configure", async (tx) => {
      const [event] = await tx
        .select()
        .from(outboxEvents)
        .where(
          and(eq(outboxEvents.organizationId, org), eq(outboxEvents.id, id)),
        )
        .for("update");
      if (!event || event.status !== "failed")
        throw new AccessDenied(
          "Only failed events can be replayed. Refresh to check the current state.",
        );
      await tx
        .update(outboxEvents)
        .set({
          status: "pending",
          attempts: 0,
          availableAt: new Date(),
          lastError: null,
          leaseUntil: null,
          leaseToken: null,
        })
        .where(eq(outboxEvents.id, id));
      // Preserve run and effect identities, the evaluation snapshot and original version choices.
      await tx
        .update(automationRuns)
        .set({ status: "pending", error: null })
        .where(
          and(
            eq(automationRuns.organizationId, org),
            eq(automationRuns.eventId, id),
            eq(automationRuns.status, "failed"),
          ),
        );
      await writeAudit(
        tx,
        org,
        actor.id,
        "automation.replayed",
        "automation_event",
        id,
        { attempts: event.attempts, error: event.lastError },
        {
          reason:
            "Administrator requested replay; original plan and effects retained.",
        },
      );
    });
  }
  async function catalog(
    actor: Actor,
    org: string,
    pageInput: unknown = 1,
    search = "",
  ) {
    const page = pageNumber(pageInput);
    return ws.within(actor, org, "configure", async (tx) => {
      const filter = and(
        eq(funnelVersions.organizationId, org),
        ilike(
          funnels.name,
          `%${search.slice(0, 160).replace(/[\\%_]/g, "\\$&")}%`,
        ),
      );
      const rows = await tx
        .select({ version: funnelVersions, name: funnels.name })
        .from(funnelVersions)
        .innerJoin(
          funnels,
          and(
            eq(funnels.organizationId, funnelVersions.organizationId),
            eq(funnels.id, funnelVersions.funnelId),
          ),
        )
        .where(filter)
        .orderBy(desc(funnelVersions.publishedAt), desc(funnelVersions.id))
        .limit(25)
        .offset((page - 1) * 25);
      const [total] = await tx
        .select({ total: count() })
        .from(funnelVersions)
        .innerJoin(
          funnels,
          and(
            eq(funnels.organizationId, funnelVersions.organizationId),
            eq(funnels.id, funnelVersions.funnelId),
          ),
        )
        .where(filter);
      return { rows, total: total.total, page };
    });
  }
  async function inbox(actor: Actor, org: string, pageInput: unknown = 1) {
    const page = pageNumber(pageInput);
    return ws.within(actor, org, "view", async (tx, context) => {
      const predicate = and(
        eq(notifications.organizationId, org),
        eq(notifications.recipientId, actor.id),
        visibilityScope(deals, context),
      );
      const rows = await tx
        .select({ notification: notifications, opportunityName: deals.name })
        .from(notifications)
        .innerJoin(
          deals,
          and(
            eq(deals.organizationId, notifications.organizationId),
            eq(deals.id, notifications.dealId),
          ),
        )
        .where(predicate)
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(25)
        .offset((page - 1) * 25);
      const [total] = await tx
        .select({ total: count() })
        .from(notifications)
        .innerJoin(
          deals,
          and(
            eq(deals.organizationId, notifications.organizationId),
            eq(deals.id, notifications.dealId),
          ),
        )
        .where(predicate);
      return { rows, page, total: total.total };
    });
  }
  async function markRead(actor: Actor, org: string, id: string) {
    z.uuid().parse(id);
    return ws.within(actor, org, "view", async (tx, context) => {
      const [row] = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .innerJoin(
          deals,
          and(
            eq(deals.organizationId, notifications.organizationId),
            eq(deals.id, notifications.dealId),
          ),
        )
        .where(
          and(
            eq(notifications.organizationId, org),
            eq(notifications.recipientId, actor.id),
            eq(notifications.id, id),
            visibilityScope(deals, context),
          ),
        );
      if (!row) throw new AccessDenied("Notification unavailable.");
      await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.organizationId, org),
            eq(notifications.id, id),
            isNull(notifications.readAt),
          ),
        );
    });
  }
  return { publish, archive, overview, replay, catalog, inbox, markRead };
}
