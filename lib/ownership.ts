import { and, eq, type AnyColumn } from "drizzle-orm";
export function ownerScope(table: { ownerId: AnyColumn }, ownerId: string) {
  if (!ownerId) throw new Error("Authentication required.");
  return eq(table.ownerId, ownerId);
}
export function recordScope(
  table: { id: AnyColumn; ownerId: AnyColumn },
  ownerId: string,
  id: string,
) {
  return and(ownerScope(table, ownerId), eq(table.id, id));
}
