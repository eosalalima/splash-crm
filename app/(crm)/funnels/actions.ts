"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { workspaceRequest } from "@/lib/access/server";
import { AccessDenied } from "@/lib/access/policy";
import { getDb } from "@/lib/db";
import { funnelService } from "@/lib/domain/funnels";
export type FunnelActionState = {
  error?: string;
  message?: string;
  revision?: number;
};
export async function funnelAction(
  command: string,
  id: string | undefined,
  _previous: FunnelActionState,
  form: FormData,
): Promise<FunnelActionState> {
  const { actor, organizationId } = await workspaceRequest();
  const service = funnelService(getDb());
  let destination: string | undefined;
  let revision: number | undefined;
  const text = (name: string) => String(form.get(name) ?? "");
  try {
    if (command === "create" || command === "clone") {
      const created = await service.create(actor, organizationId, {
        name: text("name"),
        ...(command === "clone" ? { sourceId: id } : {}),
      });
      destination = `/funnels/${created}`;
    } else if (command === "saveDraft")
      revision = await service.saveDraft(actor, organizationId, id!, {
        name: text("name"),
        description: text("description"),
        expectedRevision: text("expectedRevision"),
        definition: JSON.parse(text("definition")),
        layout: JSON.parse(text("layout")),
      });
    else if (command === "publish")
      await service.publish(actor, organizationId, id!, {
        expectedRevision: text("expectedRevision"),
        commandKey: text("commandKey"),
      });
    else if (command === "archive")
      await service.archive(actor, organizationId, id!);
    else if (command === "enroll") {
      const result = await service.enroll(actor, organizationId, {
        dealId: id,
        versionId: text("versionOverride") || text("versionId"),
        commandKey: text("commandKey"),
        source: "ui",
      });
      destination = `/journeys/${result.instanceId}`;
    } else if (command === "move")
      await service.move(actor, organizationId, {
        instanceId: id,
        targetStage: text("targetStage"),
        expectedRevision: text("expectedRevision"),
        reason: text("reason"),
        comment: text("comment"),
        commandKey: text("commandKey"),
        source: "ui",
      });
    else throw new AccessDenied();
  } catch (error) {
    if (error instanceof AccessDenied) return { error: error.message };
    if (error instanceof ZodError)
      return {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" "),
      };
    if (error instanceof SyntaxError)
      return { error: "Invalid draft data. Reload the page and try again." };
    return {
      error:
        "Unable to apply this command. Refresh the page and review the current state before retrying.",
    };
  }
  // These commands do not change workspace/session layout state. Refresh only
  // the affected pages so another view's command cannot reset the whole shell.
  revalidatePath("/funnels");
  revalidatePath("/funnels/[id]", "page");
  revalidatePath("/pipeline");
  revalidatePath("/journeys/[id]", "page");
  revalidatePath("/[entity]/[id]", "page");
  revalidatePath("/settings/audit");
  if (destination) redirect(destination);
  return {
    message:
      command === "move"
        ? "Stage movement committed."
        : command === "publish"
          ? "Saved draft published. Existing journeys keep their pinned version."
          : command === "archive"
            ? "Funnel archived. Existing journeys can still finish."
            : "Draft saved.",
    revision,
  };
}
