import { and, eq, isNull, asc, desc, count } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  organizations,
  memberships,
  teams,
  teamMemberships,
  invitations,
  auditEvents,
} from "../db/schema";
import {
  AccessDenied,
  can,
  presets,
  roles,
  type AccessContext,
  type Permission,
} from "../access/policy";
import type { Database } from "./database";
export type Actor = {
  id: string;
  email: string;
  name?: string | null;
  emailVerified?: boolean;
};
export type WorkTx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const uuid = z.uuid();
const nameInput = z.string().trim().min(1).max(120);
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function writeAudit(
  tx: WorkTx,
  org: string,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  beforeData: Record<string, unknown> | null,
  afterData: Record<string, unknown> | null,
) {
  await tx.insert(auditEvents).values({
    organizationId: org,
    actorId,
    action,
    entity,
    entityId,
    beforeData,
    afterData,
  });
}
export function workspaceService(db: Database) {
  async function available(actor: Actor, bootstrap = true) {
    if (!actor.id) throw new AccessDenied();
    const active = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .innerJoin(memberships, eq(organizations.id, memberships.organizationId))
      .where(
        and(eq(memberships.userId, actor.id), isNull(memberships.revokedAt)),
      )
      .orderBy(asc(organizations.createdAt), asc(organizations.id));
    if (active.length || !bootstrap) return active;
    return db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({
          name: `${actor.name?.trim() || "My"} workspace`,
          legacyOwnerId: actor.id,
        })
        .onConflictDoNothing()
        .returning();
      if (!org) {
        const [existing] = await tx
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .innerJoin(
            memberships,
            eq(organizations.id, memberships.organizationId),
          )
          .where(
            and(
              eq(organizations.legacyOwnerId, actor.id),
              eq(memberships.userId, actor.id),
              isNull(memberships.revokedAt),
            ),
          );
        if (existing) return [existing];
        throw new AccessDenied(
          "No active workspace membership. Ask a workspace administrator for an invitation.",
        );
      }
      await tx.insert(memberships).values({
        organizationId: org.id,
        userId: actor.id,
        name: actor.name || "Administrator",
        email: actor.email,
        role: "administrator",
        scope: "organization",
      });
      await writeAudit(
        tx,
        org.id,
        actor.id,
        "workspace.created",
        "organization",
        org.id,
        null,
        { name: org.name },
      );
      return [{ id: org.id, name: org.name }];
    });
  }
  async function within<T>(
    actor: Actor,
    orgId: string,
    permission: Permission,
    fn: (tx: WorkTx, context: AccessContext) => Promise<T>,
  ) {
    uuid.parse(orgId);
    if (!actor.id) throw new AccessDenied();
    return db.transaction(async (tx) => {
      // All workspace operations share this lock, serializing membership revocation
      // with authorization+mutation+audit (conservative initial consistency policy).
      const [org] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .for("update");
      if (!org) throw new AccessDenied();
      const [member] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, orgId),
            eq(memberships.userId, actor.id),
            isNull(memberships.revokedAt),
          ),
        );
      if (!member || !can(member.role, permission)) throw new AccessDenied();
      const mine = await tx
        .select({ id: teamMemberships.teamId })
        .from(teamMemberships)
        .where(
          and(
            eq(teamMemberships.organizationId, orgId),
            eq(teamMemberships.userId, actor.id),
          ),
        );
      const teamIds = mine.map((t) => t.id);
      const peers = await tx
        .select({
          userId: teamMemberships.userId,
          teamId: teamMemberships.teamId,
        })
        .from(teamMemberships)
        .innerJoin(
          memberships,
          and(
            eq(memberships.organizationId, teamMemberships.organizationId),
            eq(memberships.userId, teamMemberships.userId),
          ),
        )
        .where(
          and(
            eq(teamMemberships.organizationId, orgId),
            isNull(memberships.revokedAt),
          ),
        );
      const context: AccessContext = {
        organizationId: orgId,
        userId: actor.id,
        role: member.role,
        scope: member.scope,
        teamIds,
        peerIds: peers
          .filter((p) => teamIds.includes(p.teamId))
          .map((p) => p.userId),
      };
      return fn(tx, context);
    });
  }
  async function info(actor: Actor, orgId: string) {
    return within(actor, orgId, "view", async (tx, context) => {
      const [organization] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId));
      const members = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, orgId),
            isNull(memberships.revokedAt),
          ),
        )
        .orderBy(asc(memberships.name));
      const allTeams = await tx
        .select()
        .from(teams)
        .where(eq(teams.organizationId, orgId))
        .orderBy(asc(teams.name));
      const teamMembers = await tx
        .select()
        .from(teamMemberships)
        .where(eq(teamMemberships.organizationId, orgId));
      const pendingInvitations = can(context.role, "configure")
        ? await tx
            .select({
              id: invitations.id,
              email: invitations.email,
              role: invitations.role,
              expiresAt: invitations.expiresAt,
            })
            .from(invitations)
            .where(
              and(
                eq(invitations.organizationId, orgId),
                isNull(invitations.acceptedAt),
                isNull(invitations.revokedAt),
              ),
            )
            .orderBy(desc(invitations.createdAt))
            .limit(50)
        : [];
      return {
        organization,
        context,
        pendingInvitations,
        teamMembers: can(context.role, "configure") ? teamMembers : [],
        members:
          can(context.role, "assign") || can(context.role, "configure")
            ? members
            : members.filter((m) => m.userId === actor.id),
        teams:
          can(context.role, "configure") || can(context.role, "assign")
            ? allTeams
            : allTeams.filter((t) => context.teamIds.includes(t.id)),
      };
    });
  }
  async function createOrganization(actor: Actor, name: unknown) {
    if (!actor.id) throw new AccessDenied();
    return db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({ name: nameInput.parse(name) })
        .returning();
      await tx.insert(memberships).values({
        organizationId: org.id,
        userId: actor.id,
        role: "administrator",
        scope: "organization",
        name: actor.name || "Administrator",
        email: actor.email,
      });
      await writeAudit(
        tx,
        org.id,
        actor.id,
        "workspace.created",
        "organization",
        org.id,
        null,
        { name: org.name },
      );
      return org.id;
    });
  }
  async function changeMember(
    actor: Actor,
    orgId: string,
    target: string,
    roleInput: unknown,
    revoke = false,
  ) {
    const role = z.enum(roles).parse(roleInput);
    return within(actor, orgId, "configure", async (tx) => {
      const [before] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, orgId),
            eq(memberships.userId, target),
            isNull(memberships.revokedAt),
          ),
        );
      if (!before) throw new AccessDenied();
      if (
        before.role === "administrator" &&
        (revoke || role !== "administrator")
      ) {
        const admins = await tx
          .select()
          .from(memberships)
          .where(
            and(
              eq(memberships.organizationId, orgId),
              eq(memberships.role, "administrator"),
              isNull(memberships.revokedAt),
            ),
          );
        if (admins.length <= 1)
          throw new AccessDenied("Keep at least one active administrator.");
      }
      const [after] = await tx
        .update(memberships)
        .set({
          role,
          scope: presets[role].scope,
          revokedAt: revoke ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(memberships.organizationId, orgId),
            eq(memberships.userId, target),
          ),
        )
        .returning();
      await writeAudit(
        tx,
        orgId,
        actor.id,
        revoke ? "membership.revoked" : "membership.changed",
        "membership",
        target,
        before,
        after,
      );
    });
  }
  async function createTeam(actor: Actor, orgId: string, name: unknown) {
    return within(actor, orgId, "configure", async (tx) => {
      const [team] = await tx
        .insert(teams)
        .values({ organizationId: orgId, name: nameInput.parse(name) })
        .returning();
      await writeAudit(
        tx,
        orgId,
        actor.id,
        "team.created",
        "team",
        team.id,
        null,
        team,
      );
      return team.id;
    });
  }
  async function changeTeamMember(
    actor: Actor,
    orgId: string,
    teamId: string,
    userId: string,
    remove = false,
  ) {
    uuid.parse(teamId);
    return within(actor, orgId, "configure", async (tx) => {
      const [team] = await tx
        .select()
        .from(teams)
        .where(and(eq(teams.organizationId, orgId), eq(teams.id, teamId)));
      const [member] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, orgId),
            eq(memberships.userId, userId),
            isNull(memberships.revokedAt),
          ),
        );
      if (!team || !member)
        throw new AccessDenied("Select an active workspace member and team.");
      const changed = remove
        ? await tx
            .delete(teamMemberships)
            .where(
              and(
                eq(teamMemberships.organizationId, orgId),
                eq(teamMemberships.teamId, teamId),
                eq(teamMemberships.userId, userId),
              ),
            )
            .returning()
        : await tx
            .insert(teamMemberships)
            .values({ organizationId: orgId, teamId, userId })
            .onConflictDoNothing()
            .returning();
      if (!changed.length) return;
      await writeAudit(
        tx,
        orgId,
        actor.id,
        remove ? "team.member_removed" : "team.member_added",
        "team",
        teamId,
        null,
        { userId },
      );
    });
  }
  async function invite(
    actor: Actor,
    orgId: string,
    emailInput: unknown,
    roleInput: unknown,
  ) {
    const email = z.email().parse(emailInput).toLowerCase();
    const role = z.enum(roles).parse(roleInput);
    const token = randomBytes(32).toString("hex");
    await within(actor, orgId, "configure", async (tx) => {
      const replaced = await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(invitations.organizationId, orgId),
            eq(invitations.email, email),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
          ),
        )
        .returning({ id: invitations.id });
      const [invitation] = await tx
        .insert(invitations)
        .values({
          organizationId: orgId,
          email,
          role,
          tokenHash: hashToken(token),
          invitedBy: actor.id,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        })
        .returning();
      await writeAudit(
        tx,
        orgId,
        actor.id,
        "invitation.created",
        "invitation",
        invitation.id,
        null,
        {
          email,
          role,
          expiresAt: invitation.expiresAt,
          replacedInvitationIds: replaced.map((r) => r.id),
        },
      );
    });
    return token;
  }
  async function revokeInvitation(actor: Actor, orgId: string, id: string) {
    uuid.parse(id);
    return within(actor, orgId, "configure", async (tx) => {
      const [row] = await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(invitations.organizationId, orgId),
            eq(invitations.id, id),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
          ),
        )
        .returning();
      if (!row) throw new AccessDenied("Invitation not found or unavailable.");
      await writeAudit(
        tx,
        orgId,
        actor.id,
        "invitation.revoked",
        "invitation",
        id,
        { email: row.email, role: row.role },
        { revokedAt: row.revokedAt },
      );
    });
  }
  async function accept(actor: Actor, tokenInput: unknown) {
    const token = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(tokenInput);
    if (!actor.id || actor.emailVerified !== true)
      throw new AccessDenied(
        "Verify your sign-in email before accepting an invitation.",
      );
    const [lookup] = await db
      .select({ organizationId: invitations.organizationId })
      .from(invitations)
      .where(eq(invitations.tokenHash, hashToken(token)));
    if (!lookup)
      throw new AccessDenied("Invitation is unavailable or expired.");
    return db.transaction(async (tx) => {
      await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, lookup.organizationId))
        .for("update");
      const [invitation] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.tokenHash, hashToken(token)));
      if (
        !invitation ||
        invitation.revokedAt ||
        invitation.acceptedAt ||
        invitation.expiresAt <= new Date() ||
        invitation.email !== actor.email.toLowerCase()
      )
        throw new AccessDenied(
          "Invitation is unavailable or expired for this email.",
        );
      const [inviter] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, invitation.organizationId),
            eq(memberships.userId, invitation.invitedBy),
            isNull(memberships.revokedAt),
          ),
        );
      if (!inviter || !can(inviter.role, "configure"))
        throw new AccessDenied("The inviter no longer has permission.");
      const [existing] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, invitation.organizationId),
            eq(memberships.userId, actor.id),
          ),
        );
      if (!existing || existing.revokedAt)
        await tx
          .insert(memberships)
          .values({
            organizationId: invitation.organizationId,
            userId: actor.id,
            email: actor.email,
            name: actor.name || "Member",
            role: invitation.role,
            scope: presets[invitation.role].scope,
          })
          .onConflictDoUpdate({
            target: [memberships.organizationId, memberships.userId],
            set: {
              email: actor.email,
              name: actor.name || "Member",
              role: invitation.role,
              scope: presets[invitation.role].scope,
              revokedAt: null,
              updatedAt: new Date(),
            },
          });
      await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, invitation.id));
      await writeAudit(
        tx,
        invitation.organizationId,
        actor.id,
        "invitation.accepted",
        "membership",
        actor.id,
        null,
        { invitationId: invitation.id },
      );
      return invitation.organizationId;
    });
  }
  async function audit(actor: Actor, orgId: string, page = 1) {
    page = Math.max(1, Math.min(100000, Math.floor(page) || 1));
    return within(actor, orgId, "configure", async (tx) => {
      const where = eq(auditEvents.organizationId, orgId);
      const [{ total }] = await tx
        .select({ total: count() })
        .from(auditEvents)
        .where(where);
      const rows = await tx
        .select()
        .from(auditEvents)
        .where(where)
        .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
        .limit(50)
        .offset((page - 1) * 50);
      return { rows, total, page };
    });
  }
  return {
    available,
    within,
    info,
    createOrganization,
    changeMember,
    createTeam,
    changeTeamMember,
    invite,
    revokeInvitation,
    accept,
    audit,
  };
}
