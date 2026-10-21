import "server-only";
import { getDb } from "./db";
import { workspaceRequest } from "./access/server";
import { crmService } from "./domain/crm";
import type { Kind } from "./validation";
export async function recordsPage(kind: Kind, search = "", page: unknown = 1) {
  const { actor, organizationId } = await workspaceRequest();
  return crmService(getDb()).list(actor, organizationId, kind, search, page);
}
export async function listRecords(kind: Kind, search = "") {
  return (await recordsPage(kind, search)).rows;
}
export async function getRecord(kind: Kind, id: string) {
  const { actor, organizationId } = await workspaceRequest();
  return crmService(getDb()).get(actor, organizationId, kind, id);
}
export async function companyChoices(
  selectedIds: string[] = [],
  search = "",
  page: unknown = 1,
) {
  const { actor, organizationId } = await workspaceRequest();
  return crmService(getDb()).companyOptions(
    actor,
    organizationId,
    search,
    page,
    selectedIds,
  );
}
export async function companyOptions(selectedIds: string[] = []) {
  return (await companyChoices(selectedIds)).rows;
}
export async function saveRecord(kind: Kind, input: unknown, id?: string) {
  const { actor, organizationId } = await workspaceRequest();
  return crmService(getDb()).save(actor, organizationId, kind, input, id);
}
export async function deleteRecord(kind: Kind, id: string) {
  const { actor, organizationId } = await workspaceRequest();
  return crmService(getDb()).remove(actor, organizationId, kind, id);
}
export async function dashboardStats() {
  const { actor, organizationId } = await workspaceRequest();
  return crmService(getDb()).stats(actor, organizationId);
}
