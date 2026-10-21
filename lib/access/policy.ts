import { and, eq, inArray, isNull, or, type AnyColumn } from "drizzle-orm";
export const roles = [
  "administrator",
  "manager",
  "representative",
  "read_only",
] as const;
export type Role = (typeof roles)[number];
export type Scope = "own" | "team" | "organization";
export const permissions = [
  "view",
  "create",
  "edit",
  "delete",
  "assign",
  "approve",
  "export",
  "configure",
] as const;
export type Permission = (typeof permissions)[number];
export const presets: Record<
  Role,
  { scope: Scope; permissions: readonly Permission[] }
> = {
  administrator: { scope: "organization", permissions },
  manager: {
    scope: "team",
    permissions: [
      "view",
      "create",
      "edit",
      "delete",
      "assign",
      "approve",
      "export",
    ],
  },
  representative: {
    scope: "own",
    permissions: ["view", "create", "edit", "delete"],
  },
  read_only: { scope: "organization", permissions: ["view"] },
};
export class AccessDenied extends Error {
  constructor(message = "You do not have permission for this operation.") {
    super(message);
    this.name = "AccessDenied";
  }
}
export function can(role: string, permission: Permission) {
  return (
    roles.includes(role as Role) &&
    presets[role as Role].permissions.includes(permission)
  );
}
export type AccessContext = {
  organizationId: string;
  userId: string;
  role: Role;
  scope: Scope;
  teamIds: string[];
  peerIds: string[];
};
export function visibilityScope(
  table: {
    organizationId: AnyColumn;
    ownerId: AnyColumn;
    assignedTeamId: AnyColumn;
    deletedAt: AnyColumn;
  },
  context: AccessContext,
) {
  if (!context.organizationId || !context.userId) throw new AccessDenied();
  if (!["own", "team", "organization"].includes(context.scope))
    throw new AccessDenied("Unsupported visibility scope.");
  const own = eq(table.ownerId, context.userId);
  const visible =
    context.scope === "organization"
      ? undefined
      : context.scope === "own"
        ? own
        : or(
            own,
            context.peerIds.length
              ? inArray(table.ownerId, context.peerIds)
              : undefined,
            context.teamIds.length
              ? inArray(table.assignedTeamId, context.teamIds)
              : undefined,
          );
  return and(
    eq(table.organizationId, context.organizationId),
    isNull(table.deletedAt),
    visible,
  );
}
