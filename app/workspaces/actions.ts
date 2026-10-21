"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/lib/auth/server";
import { organizationCookie, workspaceRequest } from "@/lib/access/server";
import { getDb } from "@/lib/db";
import { workspaceService } from "@/lib/domain/workspace";
import { AccessDenied } from "@/lib/access/policy";
export type WorkspaceState = {
  error?: string;
  message?: string;
  invitationPath?: string;
};
async function selectOrganization(id: string) {
  (await cookies()).set(organizationCookie, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400 * 30,
  });
  revalidatePath("/", "layout");
}
export async function workspaceAction(
  operation: string,
  _state: WorkspaceState,
  form: FormData,
): Promise<WorkspaceState> {
  const actor = await requireUser();
  const service = workspaceService(getDb());
  let destination: string | null = null;
  try {
    const value = (key: string) => String(form.get(key) ?? "");
    if (operation === "switch") {
      const id = value("organizationId");
      await service.info(actor, id);
      await selectOrganization(id);
      destination = "/dashboard";
    } else if (operation === "create") {
      const id = await service.createOrganization(actor, value("name"));
      await selectOrganization(id);
      destination = "/settings/workspace";
    } else if (operation === "accept") {
      const id = await service.accept(actor, value("token"));
      await selectOrganization(id);
      destination = "/dashboard";
    } else {
      // Mutation organization comes from the validated server context, not a hidden form field.
      const { organizationId } = await workspaceRequest();
      if (operation === "invite") {
        const token = await service.invite(
          actor,
          organizationId,
          value("email"),
          value("role"),
        );
        revalidatePath("/settings/workspace");
        return {
          message:
            "Invitation created. Share this link securely with the intended person. It expires in seven days.",
          invitationPath: `/invite/${token}`,
        };
      } else if (operation === "revoke-invitation")
        await service.revokeInvitation(
          actor,
          organizationId,
          value("invitationId"),
        );
      else if (operation === "member")
        await service.changeMember(
          actor,
          organizationId,
          value("userId"),
          value("role"),
          value("revoke") === "yes",
        );
      else if (operation === "team")
        await service.createTeam(actor, organizationId, value("name"));
      else if (operation === "team-member")
        await service.changeTeamMember(
          actor,
          organizationId,
          value("teamId"),
          value("userId"),
          value("remove") === "yes",
        );
      else throw new AccessDenied();
      revalidatePath("/", "layout");
      return { message: "Workspace updated." };
    }
  } catch (error) {
    return {
      error:
        error instanceof AccessDenied
          ? error.message
          : error instanceof ZodError
            ? "Check the fields and try again."
            : "Unable to update the workspace. Check your selections or try again.",
    };
  }
  if (destination) redirect(destination);
  return {};
}

export async function clearWorkspaceSelection() {
  (await cookies()).delete(organizationCookie);
}
