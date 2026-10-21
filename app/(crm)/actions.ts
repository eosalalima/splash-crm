"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/lib/access/policy";
import { ZodError } from "zod";
import { saveRecord, deleteRecord } from "@/lib/crm";
import { kindSchema } from "@/lib/validation";
import { requireUser } from "@/lib/auth/server";
export type ActionState = { error?: string };
export async function save(
  kind: string,
  id: string | undefined,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireUser();
  const entity = kindSchema.parse(kind);
  let savedId: string;
  try {
    savedId = await saveRecord(entity, Object.fromEntries(form), id);
  } catch (error) {
    if (error instanceof AccessDenied) return { error: error.message };
    if (error instanceof ZodError)
      return {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" "),
      };
    return {
      error:
        "Unable to save. Check the fields and company selection, then try again.",
    };
  }
  revalidatePath("/", "layout");
  redirect(entity === "contacts" ? `/contacts/${savedId}` : `/${entity}`);
}
export async function remove(
  kind: string,
  id: string,
  _previous: ActionState,
): Promise<ActionState> {
  void _previous;
  await requireUser();
  const entity = kindSchema.parse(kind);
  try {
    await deleteRecord(entity, id);
  } catch {
    return {
      error:
        entity === "companies"
          ? "Unable to delete. Unlink this company from its contacts and deals first, then try again."
          : "Unable to delete this record. Try again.",
    };
  }
  revalidatePath("/", "layout");
  redirect(`/${entity}`);
}
