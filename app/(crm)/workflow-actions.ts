"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import { workspaceRequest } from "@/lib/access/server";
import { AccessDenied } from "@/lib/access/policy";
import { getDb } from "@/lib/db";
import { workflowService } from "@/lib/domain/workflow";
export type WorkflowState = { error?: string; message?: string };
export async function workflowAction(
  command: string,
  id: string | undefined,
  _state: WorkflowState,
  form: FormData,
): Promise<WorkflowState> {
  const { actor, organizationId } = await workspaceRequest();
  const service = workflowService(getDb());
  let destination: string | undefined;
  try {
    const data = Object.fromEntries(form);
    if (command === "convert") {
      const result = await service.convert(actor, organizationId, {
        ...data,
        leadId: id,
        createCompany: data.createCompany === "on",
        createOpportunity: data.createOpportunity === "on",
      });
      destination = result.dealId
        ? `/deals/${result.dealId}`
        : `/contacts/${result.contactId}`;
    } else if (command === "product")
      await service.attachProduct(actor, organizationId, id!, data);
    else if (command === "products" || command === "sources")
      await service.configure(
        actor,
        organizationId,
        command,
        data,
        id,
        data.archive === "on",
      );
    else throw new AccessDenied();
  } catch (error) {
    if (error instanceof AccessDenied) return { error: error.message };
    if (error instanceof ZodError)
      return {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" "),
      };
    if (z.object({ code: z.literal("23505") }).safeParse(error).success)
      return {
        error:
          "That name already exists. Use another name or edit the existing entry.",
      };
    return { error: "Unable to save. Check your selections and try again." };
  }
  revalidatePath("/", "layout");
  if (destination) redirect(destination);
  return { message: "Saved successfully." };
}
