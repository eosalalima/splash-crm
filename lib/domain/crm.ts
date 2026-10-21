import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sum,
} from "drizzle-orm";
import { z } from "zod";
import {
  companies,
  contacts,
  deals,
  memberships,
  teamMemberships,
} from "../db/schema";
import {
  can,
  AccessDenied,
  visibilityScope,
  type AccessContext,
} from "../access/policy";
import {
  companyInput,
  contactInput,
  dealInput,
  idSchema,
  type Kind,
} from "../validation";
import {
  workspaceService,
  writeAudit,
  type Actor,
  type WorkTx,
} from "./workspace";
import type { Database } from "./database";
export const tables = { companies, contacts, deals };
export const pageNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? Math.min(n, 100000) : 1;
};
const assignmentInput = z.object({
  ownerId: z.string().min(1).optional(),
  assignedTeamId: z
    .union([z.uuid(), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? null : v)),
});
export function crmService(db: Database) {
  const access = workspaceService(db);
  async function list(
    actor: Actor,
    org: string,
    kind: Kind,
    search = "",
    pageInput: unknown = 1,
  ) {
    const page = pageNumber(pageInput);
    return access.within(actor, org, "view", async (tx, context) => {
      const table = tables[kind];
      const escaped = search.slice(0, 160).replace(/[\\%_]/g, "\\$&");
      const filter = and(
        visibilityScope(table, context),
        escaped
          ? kind === "contacts"
            ? or(
                ilike(contacts.name, `%${escaped}%`),
                ilike(contacts.email, `%${escaped}%`),
              )
            : ilike(table.name, `%${escaped}%`)
          : undefined,
      );
      const [{ total }] = await tx
        .select({ total: count() })
        .from(table)
        .where(filter);
      const rows = await tx
        .select()
        .from(table)
        .where(filter)
        .orderBy(desc(table.createdAt), desc(table.id))
        .limit(50)
        .offset((page - 1) * 50);
      return { rows, total, page, pageSize: 50 };
    });
  }
  async function get(actor: Actor, org: string, kind: Kind, id: string) {
    if (!idSchema.safeParse(id).success) return null;
    return access.within(actor, org, "view", async (tx, context) => {
      const table = tables[kind];
      const [row] = await tx
        .select()
        .from(table)
        .where(and(visibilityScope(table, context), eq(table.id, id)));
      return row ?? null;
    });
  }
  async function companyOptions(
    actor: Actor,
    org: string,
    search = "",
    pageInput: unknown = 1,
    selectedIds: string[] = [],
  ) {
    const page = pageNumber(pageInput);
    const ids = selectedIds
      .slice(0, 50)
      .filter((id) => idSchema.safeParse(id).success);
    const escaped = search.slice(0, 160).replace(/[\\%_]/g, "\\$&");
    return access.within(actor, org, "view", async (tx, context) => {
      const scope = visibilityScope(companies, context);
      const filter = and(
        scope,
        escaped ? ilike(companies.name, `%${escaped}%`) : undefined,
      );
      const [{ total }] = await tx
        .select({ total: count() })
        .from(companies)
        .where(filter);
      const rows = await tx
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(filter)
        .orderBy(asc(companies.name), asc(companies.id))
        .limit(50)
        .offset((page - 1) * 50);
      const selected = ids.length
        ? await tx
            .select({ id: companies.id, name: companies.name })
            .from(companies)
            .where(and(scope, inArray(companies.id, ids)))
        : [];
      return {
        rows: [
          ...rows,
          ...selected.filter((c) => !rows.some((r) => r.id === c.id)),
        ],
        total,
        page,
        pageSize: 50,
      };
    });
  }
  async function validateAssignment(
    tx: WorkTx,
    context: AccessContext,
    owner: string,
    team: string | null,
  ) {
    const [active] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, context.organizationId),
          eq(memberships.userId, owner),
          isNull(memberships.revokedAt),
        ),
      );
    if (!active)
      throw new AccessDenied("Assignee must be an active workspace member.");
    if (
      context.scope !== "organization" &&
      owner !== context.userId &&
      !context.peerIds.includes(owner)
    )
      throw new AccessDenied("Assign only within your visibility scope.");
    if (team) {
      const [assignment] = await tx
        .select()
        .from(teamMemberships)
        .where(
          and(
            eq(teamMemberships.organizationId, context.organizationId),
            eq(teamMemberships.teamId, team),
            eq(teamMemberships.userId, owner),
          ),
        );
      if (
        !assignment ||
        (context.scope !== "organization" && !context.teamIds.includes(team))
      )
        throw new AccessDenied(
          "The assignee must belong to the selected workspace team.",
        );
    }
  }
  async function save(
    actor: Actor,
    org: string,
    kind: Kind,
    input: unknown,
    id?: string,
  ) {
    if (id) idSchema.parse(id);
    const data =
      kind === "companies"
        ? companyInput.parse(input)
        : kind === "contacts"
          ? contactInput.parse(input)
          : dealInput.parse(input);
    const assignment = assignmentInput.parse(input);
    return access.within(
      actor,
      org,
      id ? "edit" : "create",
      async (tx, context) => {
        const table = tables[kind];
        const [before] = id
          ? await tx
              .select()
              .from(table)
              .where(and(visibilityScope(table, context), eq(table.id, id)))
          : [];
        if (id && !before)
          throw new AccessDenied("Record not found or unavailable.");
        const ownerId = assignment.ownerId ?? before?.ownerId ?? actor.id;
        const assignedTeamId =
          assignment.assignedTeamId === undefined
            ? (before?.assignedTeamId ?? null)
            : assignment.assignedTeamId;
        const reassigned =
          ownerId !== (before?.ownerId ?? actor.id) ||
          assignedTeamId !== (before?.assignedTeamId ?? null);
        if (reassigned && !can(context.role, "assign"))
          throw new AccessDenied("You cannot reassign records.");
        if (!before || reassigned)
          await validateAssignment(tx, context, ownerId, assignedTeamId);
        if (
          "companyId" in data &&
          data.companyId &&
          (!before ||
            !("companyId" in before) ||
            data.companyId !== before.companyId)
        ) {
          const [company] = await tx
            .select()
            .from(companies)
            .where(
              and(
                visibilityScope(companies, context),
                eq(companies.id, data.companyId),
              ),
            );
          if (!company)
            throw new AccessDenied(
              "Select an available company in this workspace.",
            );
        }
        const common = {
          organizationId: org,
          ownerId,
          assignedTeamId,
          updatedAt: new Date(),
        };
        let after;
        if (kind === "companies") {
          const values = { ...companyInput.parse(input), ...common };
          [after] = id
            ? await tx
                .update(companies)
                .set(values)
                .where(
                  and(eq(companies.organizationId, org), eq(companies.id, id)),
                )
                .returning()
            : await tx.insert(companies).values(values).returning();
        } else if (kind === "contacts") {
          const values = { ...contactInput.parse(input), ...common };
          [after] = id
            ? await tx
                .update(contacts)
                .set(values)
                .where(
                  and(eq(contacts.organizationId, org), eq(contacts.id, id)),
                )
                .returning()
            : await tx.insert(contacts).values(values).returning();
        } else {
          const values = { ...dealInput.parse(input), ...common };
          [after] = id
            ? await tx
                .update(deals)
                .set(values)
                .where(and(eq(deals.organizationId, org), eq(deals.id, id)))
                .returning()
            : await tx.insert(deals).values(values).returning();
        }
        await writeAudit(
          tx,
          org,
          actor.id,
          id ? "record.updated" : "record.created",
          kind,
          after.id,
          before ?? null,
          after,
        );
        if (reassigned)
          await writeAudit(
            tx,
            org,
            actor.id,
            "record.assigned",
            kind,
            after.id,
            before
              ? {
                  ownerId: before.ownerId,
                  assignedTeamId: before.assignedTeamId,
                }
              : null,
            { ownerId, assignedTeamId },
          );
        return after.id;
      },
    );
  }
  async function remove(actor: Actor, org: string, kind: Kind, id: string) {
    idSchema.parse(id);
    return access.within(actor, org, "delete", async (tx, context) => {
      const table = tables[kind];
      const [before] = await tx
        .select()
        .from(table)
        .where(and(visibilityScope(table, context), eq(table.id, id)));
      if (!before) throw new AccessDenied("Record not found or unavailable.");
      if (kind === "companies") {
        for (const related of [contacts, deals]) {
          const [linked] = await tx
            .select({ id: related.id })
            .from(related)
            .where(
              and(
                eq(related.organizationId, org),
                eq(related.companyId, id),
                isNull(related.deletedAt),
              ),
            )
            .limit(1);
          if (linked)
            throw new AccessDenied(
              "Unlink or delete active contacts and deals before deleting this company.",
            );
        }
      }
      const [after] = await tx
        .update(table)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(table.organizationId, org), eq(table.id, id)))
        .returning();
      await writeAudit(
        tx,
        org,
        actor.id,
        "record.deleted",
        kind,
        id,
        before,
        after,
      );
    });
  }
  async function stats(actor: Actor, org: string) {
    return access.within(actor, org, "view", async (tx, context) => {
      const [c] = await tx
        .select({ count: count() })
        .from(contacts)
        .where(visibilityScope(contacts, context));
      const [co] = await tx
        .select({ count: count() })
        .from(companies)
        .where(visibilityScope(companies, context));
      const [d] = await tx
        .select({ count: count(), value: sum(deals.value) })
        .from(deals)
        .where(
          and(
            visibilityScope(deals, context),
            or(
              eq(deals.stage, "Lead"),
              eq(deals.stage, "Qualified"),
              eq(deals.stage, "Proposal"),
            ),
          ),
        );
      const stages = await tx
        .select({ stage: deals.stage, count: count(), value: sum(deals.value) })
        .from(deals)
        .where(visibilityScope(deals, context))
        .groupBy(deals.stage);
      return {
        contacts: c.count,
        companies: co.count,
        openDeals: d.count,
        pipeline: Number(d.value ?? 0),
        stages,
      };
    });
  }
  return { list, get, companyOptions, save, remove, stats };
}
