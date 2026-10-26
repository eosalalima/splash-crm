import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  activities,
  automations,
  automationVersions,
  automationRuns,
  automationActions,
  outboxEvents,
  transitionEvents,
  funnelInstances,
  deals,
  notifications,
} from "../db/schema";
import {
  automationDefinitionInput,
  conditionsMatch,
  type AutomationAction,
} from "../automation/definition";
import { AccessDenied, visibilityScope } from "../access/policy";
import { authorizeWorkspace, writeAudit, type WorkTx } from "./workspace";
import type { Database } from "./database";

export const MAX_ATTEMPTS = 6;
export const LEASE_MS = 120_000;
const retryDelays = [1_000, 5_000, 15_000, 60_000, 300_000];
export class LeaseLost extends Error {}
export type EventLease = { id: string; organizationId: string; token: string };
export function automationWorker(db: Database) {
  async function claim(): Promise<EventLease | null> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '3s'`);
      await tx.execute(sql`set local statement_timeout = '15s'`);
      const [event] = await tx
        .select()
        .from(outboxEvents)
        .where(
          or(
            and(
              eq(outboxEvents.status, "pending"),
              lte(outboxEvents.availableAt, sql`now()`),
            ),
            and(
              eq(outboxEvents.status, "processing"),
              lte(outboxEvents.leaseUntil, sql`now()`),
            ),
          ),
        )
        .orderBy(asc(outboxEvents.availableAt), asc(outboxEvents.id))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!event) return null;
      if (event.attempts >= MAX_ATTEMPTS) {
        await tx
          .update(outboxEvents)
          .set({
            status: "failed",
            leaseToken: null,
            leaseUntil: null,
            lastError:
              "Retry limit reached after worker lease expiry. Inspect and replay after resolving the cause.",
          })
          .where(eq(outboxEvents.id, event.id));
        await tx
          .update(automationRuns)
          .set({
            status: "failed",
            error: "Worker lease expired at retry limit.",
          })
          .where(
            and(
              eq(automationRuns.organizationId, event.organizationId),
              eq(automationRuns.eventId, event.id),
              eq(automationRuns.status, "pending"),
            ),
          );
        return null;
      }
      const token = randomUUID();
      await tx
        .update(outboxEvents)
        .set({
          status: "processing",
          attempts: event.attempts + 1,
          leaseToken: token,
          leaseUntil: sql`now() + interval '120 seconds'`,
        })
        .where(eq(outboxEvents.id, event.id));
      return { id: event.id, organizationId: event.organizationId, token };
    });
  }
  async function leased<T>(
    lease: EventLease,
    fn: (tx: WorkTx, event: typeof outboxEvents.$inferSelect) => Promise<T>,
  ) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '3s'`);
      await tx.execute(sql`set local statement_timeout = '15s'`);
      // Same tenant-first lock ordering as membership revocation, publication and replay.
      await tx.execute(
        sql`select id from crm_organizations where id = ${lease.organizationId} for update`,
      );
      const [event] = await tx
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.organizationId, lease.organizationId),
            eq(outboxEvents.id, lease.id),
            eq(outboxEvents.status, "processing"),
            eq(outboxEvents.leaseToken, lease.token),
            sql`${outboxEvents.leaseUntil} > now()`,
          ),
        )
        .for("update");
      if (!event) throw new LeaseLost("Event lease expired or was replaced.");
      await tx
        .update(outboxEvents)
        .set({ leaseUntil: sql`now() + interval '120 seconds'` })
        .where(eq(outboxEvents.id, event.id));
      return fn(tx, event);
    });
  }
  async function subject(tx: WorkTx, event: typeof outboxEvents.$inferSelect) {
    if (!["stage.entered", "journey.completed"].includes(event.type))
      throw new AccessDenied("Unsupported automation event type.");
    const [row] = await tx
      .select({ transition: transitionEvents, instance: funnelInstances })
      .from(transitionEvents)
      .innerJoin(
        funnelInstances,
        and(
          eq(funnelInstances.organizationId, transitionEvents.organizationId),
          eq(funnelInstances.id, transitionEvents.instanceId),
        ),
      )
      .where(
        and(
          eq(transitionEvents.organizationId, event.organizationId),
          eq(transitionEvents.id, event.transitionId),
        ),
      );
    if (!row)
      throw new AccessDenied("Event subject is unavailable in this workspace.");
    const context = await authorizeWorkspace(
      tx,
      { id: row.transition.actorId, email: "" },
      event.organizationId,
      "edit",
    );
    const [deal] = await tx
      .select()
      .from(deals)
      .where(
        and(visibilityScope(deals, context), eq(deals.id, row.instance.dealId)),
      );
    if (!deal)
      throw new AccessDenied(
        "Originating actor no longer has access to the opportunity, or it was deleted.",
      );
    return { ...row, deal };
  }
  async function prepare(lease: EventLease) {
    return leased(lease, async (tx, event) => {
      const { transition, deal } = await subject(tx, event);
      if (event.plan) return event.plan.versionIds;
      const versions = await tx
        .select({ version: automationVersions })
        .from(automations)
        .innerJoin(
          automationVersions,
          and(
            eq(automationVersions.organizationId, automations.organizationId),
            eq(automationVersions.automationId, automations.id),
            eq(automationVersions.number, automations.revision),
          ),
        )
        .where(
          and(
            eq(automations.organizationId, event.organizationId),
            isNull(automations.archivedAt),
            eq(automationVersions.funnelVersionId, transition.versionId),
            eq(automationVersions.stageId, transition.toStage),
          ),
        )
        .orderBy(asc(automationVersions.id));
      const snapshot = {
        status: deal.status,
        value: deal.value,
        probability: deal.probability,
        expectedClose: deal.expectedClose,
      };
      const plan = {
        versionIds: versions.map((v) => v.version.id),
        snapshot,
        evaluatedAt: new Date().toISOString(),
      };
      await tx
        .update(outboxEvents)
        .set({ plan })
        .where(eq(outboxEvents.id, event.id));
      for (const { version } of versions) {
        const definition = automationDefinitionInput.parse(version.definition);
        const matches = conditionsMatch(definition.conditions, snapshot);
        await tx
          .insert(automationRuns)
          .values({
            organizationId: event.organizationId,
            eventId: event.id,
            workflowVersionId: version.id,
            status: matches ? "pending" : "skipped",
            completedAt: matches ? null : new Date(),
          })
          .onConflictDoNothing();
      }
      return plan.versionIds;
    });
  }
  async function executeAction(
    lease: EventLease,
    versionId: string,
    action: AutomationAction,
  ) {
    return leased(lease, async (tx, event) => {
      const [run] = await tx
        .select()
        .from(automationRuns)
        .where(
          and(
            eq(automationRuns.organizationId, event.organizationId),
            eq(automationRuns.eventId, event.id),
            eq(automationRuns.workflowVersionId, versionId),
          ),
        );
      if (!run || run.status === "skipped" || run.status === "completed")
        return;
      const [previous] = await tx
        .select()
        .from(automationActions)
        .where(
          and(
            eq(automationActions.organizationId, event.organizationId),
            eq(automationActions.runId, run.id),
            eq(automationActions.actionId, action.id),
          ),
        );
      if (previous) return;
      const { deal, transition } = await subject(tx, event);
      const [row] = await tx
        .select({ version: automationVersions, workflow: automations })
        .from(automationVersions)
        .innerJoin(
          automations,
          and(
            eq(automations.organizationId, automationVersions.organizationId),
            eq(automations.id, automationVersions.automationId),
          ),
        )
        .where(
          and(
            eq(automationVersions.organizationId, event.organizationId),
            eq(automationVersions.id, versionId),
          ),
        );
      if (!row || row.workflow.archivedAt)
        throw new AccessDenied(
          "Workflow was archived; pending actions are stopped.",
        );
      const publisher = { id: row.version.publishedBy, email: "" };
      const publisherContext = await authorizeWorkspace(
        tx,
        publisher,
        event.organizationId,
        "configure",
      );
      if (
        !(
          await tx
            .select({ id: deals.id })
            .from(deals)
            .where(
              and(
                eq(deals.id, deal.id),
                visibilityScope(deals, publisherContext),
              ),
            )
        )[0]
      )
        throw new AccessDenied(
          "Workflow publisher no longer has opportunity access.",
        );
      const recipientId = row.version.definition.recipientId;
      const recipient = await authorizeWorkspace(
        tx,
        { id: recipientId, email: "" },
        event.organizationId,
        action.kind === "task" ? "create" : "view",
      );
      if (
        !(
          await tx
            .select({ id: deals.id })
            .from(deals)
            .where(
              and(eq(deals.id, deal.id), visibilityScope(deals, recipient)),
            )
        )[0]
      )
        throw new AccessDenied(
          "Configured recipient no longer has access to this opportunity. Restore access before replaying.",
        );
      const effectId = randomUUID();
      if (action.kind === "task") {
        await tx
          .insert(activities)
          .values({
            id: effectId,
            organizationId: event.organizationId,
            ownerId: recipientId,
            name: action.title,
            type: "task",
            priority: "normal",
            status: "open",
            dealId: deal.id,
            dueAt: new Date(
              transition.createdAt.getTime() + action.dueHours * 3_600_000,
            ),
            notes: `Automated follow-up. Event ${event.id}; workflow version ${versionId}; action ${action.id}.`,
          });
      } else {
        await tx
          .insert(notifications)
          .values({
            id: effectId,
            organizationId: event.organizationId,
            recipientId,
            dealId: deal.id,
            runId: run.id,
            actionId: action.id,
            message: action.title,
          });
      }
      await tx
        .insert(automationActions)
        .values({
          organizationId: event.organizationId,
          runId: run.id,
          actionId: action.id,
          kind: action.kind,
          effectId,
          recipientId,
        });
      await writeAudit(
        tx,
        event.organizationId,
        publisher.id,
        `automation.${action.kind}_created`,
        "deals",
        deal.id,
        null,
        {
          eventId: event.id,
          transitionId: transition.id,
          correlationId: transition.correlationId,
          workflowVersionId: versionId,
          runId: run.id,
          actionId: action.id,
          effectId,
          recipientId,
        },
      );
    });
  }
  // Hooks are used only by isolated crash/recovery tests; production supplies none.
  async function process(
    lease: EventLease,
    hooks?: {
      afterAction?: () => Promise<void>;
      beforeAcknowledge?: () => Promise<void>;
    },
  ) {
    const versionIds = await prepare(lease);
    for (const versionId of versionIds) {
      const [version] = await db
        .select()
        .from(automationVersions)
        .where(
          and(
            eq(automationVersions.organizationId, lease.organizationId),
            eq(automationVersions.id, versionId),
          ),
        );
      if (!version)
        throw new AccessDenied("Pinned workflow version is unavailable.");
      for (const action of automationDefinitionInput.parse(version.definition)
        .actions) {
        await executeAction(lease, versionId, action);
        await hooks?.afterAction?.();
      }
      await leased(lease, async (tx, event) => {
        await tx
          .update(automationRuns)
          .set({ status: "completed", completedAt: new Date(), error: null })
          .where(
            and(
              eq(automationRuns.organizationId, event.organizationId),
              eq(automationRuns.eventId, event.id),
              eq(automationRuns.workflowVersionId, versionId),
              eq(automationRuns.status, "pending"),
            ),
          );
      });
    }
    await hooks?.beforeAcknowledge?.();
    await leased(lease, async (tx, event) => {
      await tx
        .update(outboxEvents)
        .set({
          status: "completed",
          completedAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
          lastError: null,
        })
        .where(eq(outboxEvents.id, event.id));
    });
  }
  async function fail(lease: EventLease, error: unknown) {
    if (error instanceof LeaseLost) return;
    try {
      await leased(lease, async (tx, event) => {
        const terminal =
          error instanceof AccessDenied || event.attempts >= MAX_ATTEMPTS;
        const message =
          error instanceof AccessDenied
            ? error.message
            : "Processing failed. Check worker/database health before replaying; no secrets were logged.";
        const delay =
          retryDelays[Math.min(event.attempts - 1, retryDelays.length - 1)] *
          (1 + Math.random() * 0.2);
        await tx
          .update(outboxEvents)
          .set({
            status: terminal ? "failed" : "pending",
            availableAt: new Date(Date.now() + delay),
            lastError: message,
            leaseToken: null,
            leaseUntil: null,
          })
          .where(eq(outboxEvents.id, event.id));
        if (terminal)
          await tx
            .update(automationRuns)
            .set({ status: "failed", error: message })
            .where(
              and(
                eq(automationRuns.organizationId, event.organizationId),
                eq(automationRuns.eventId, event.id),
                eq(automationRuns.status, "pending"),
              ),
            );
      });
    } catch (failure) {
      if (!(failure instanceof LeaseLost)) throw failure;
    }
  }
  async function tick() {
    const lease = await claim();
    if (!lease) return false;
    try {
      await process(lease);
    } catch (error) {
      await fail(lease, error);
    }
    return true;
  }
  return { claim, prepare, process, fail, tick };
}
