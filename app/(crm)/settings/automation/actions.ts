"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { workspaceRequest } from "@/lib/access/server";
import { getDb } from "@/lib/db";
import { automationService } from "@/lib/domain/automation";
import { AccessDenied } from "@/lib/access/policy";
export type AutomationState = { error?: string; message?: string };
export async function automationAction(
  command: string,
  id: string | undefined,
  _state: AutomationState,
  form: FormData,
): Promise<AutomationState> {
  const { actor, organizationId } = await workspaceRequest();
  const service = automationService(getDb());
  const text = (key: string) => String(form.get(key) ?? "");
  try {
    if (command === "publish")
      await service.publish(actor, organizationId, {
        ...(id ? { id } : {}),
        name: text("name"),
        expectedRevision: text("expectedRevision"),
        commandKey: text("commandKey"),
        funnelVersionId: text("funnelVersionId"),
        stageId: text("stageId"),
        definition: JSON.parse(text("definition")),
      });
    else if (command === "archive")
      await service.archive(actor, organizationId, id!);
    else if (command === "replay")
      await service.replay(actor, organizationId, id!);
    else if (command === "read")
      await service.markRead(actor, organizationId, id!);
    else throw new AccessDenied();
  } catch (error) {
    return {
      error:
        error instanceof AccessDenied
          ? error.message
          : error instanceof ZodError
            ? error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join(" ")
            : "Unable to save this change. Refresh and check the latest state before retrying.",
    };
  }
  revalidatePath("/settings/automation");
  revalidatePath("/notifications");
  return {
    message:
      command === "publish"
        ? "Workflow version published. It applies when queued events are first processed; retries retain their original evaluation."
        : command === "replay"
          ? "Failed event queued for replay with its original plan and action identities."
          : command === "read"
            ? "Notification marked as read."
            : "Workflow archived. Pending actions will stop.",
  };
}
