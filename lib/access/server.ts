import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { workspaceService } from "@/lib/domain/workspace";
import { AccessDenied } from "./policy";
export const organizationCookie = "splash-organization";
export async function workspaceRequest() {
  const actor = await requireUser();
  const service = workspaceService(getDb());
  try {
    const workspaces = await service.available(actor);
    const organizationId =
      (await cookies()).get(organizationCookie)?.value ?? workspaces[0].id;
    // A stale/forged selector never falls back silently to a different tenant.
    if (!workspaces.some((o) => o.id === organizationId))
      redirect("/workspaces");
    // Membership and policy are rechecked in the transaction, even after this lookup.
    const info = await service.info(actor, organizationId);
    return { actor, organizationId, workspaces, ...info };
  } catch (error) {
    if (error instanceof AccessDenied) redirect("/workspaces");
    throw error;
  }
}
