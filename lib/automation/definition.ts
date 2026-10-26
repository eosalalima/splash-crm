import { z } from "zod";

export const conditionInput = z.discriminatedUnion("field", [
  z
    .object({
      field: z.literal("status"),
      operator: z.enum(["eq", "neq"]),
      value: z.enum(["open", "won", "lost"]),
    })
    .strict(),
  z
    .object({
      field: z.literal("value"),
      operator: z.enum(["gte", "lte"]),
      value: z.number().int().min(0).max(999999999),
    })
    .strict(),
  z
    .object({
      field: z.literal("probability"),
      operator: z.enum(["gte", "lte"]),
      value: z.number().int().min(0).max(100),
    })
    .strict(),
  z
    .object({
      field: z.literal("expectedClose"),
      operator: z.enum(["present", "absent"]),
    })
    .strict(),
]);
export const actionInput = z.discriminatedUnion("kind", [
  z
    .object({
      id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
      kind: z.literal("task"),
      title: z.string().trim().min(1).max(160),
      dueHours: z.number().int().min(0).max(8760),
    })
    .strict(),
  z
    .object({
      id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
      kind: z.literal("notification"),
      title: z.string().trim().min(1).max(500),
    })
    .strict(),
]);
export const automationDefinitionInput = z
  .object({
    recipientId: z.string().min(1).max(200),
    conditions: z.array(conditionInput).max(10),
    actions: z.array(actionInput).min(1).max(10),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (new Set(d.actions.map((a) => a.id)).size !== d.actions.length)
      ctx.addIssue({
        code: "custom",
        message: "Use a unique action identity for each action.",
        path: ["actions"],
      });
  });
export type AutomationDefinition = z.infer<typeof automationDefinitionInput>;
export type AutomationAction = z.infer<typeof actionInput>;
export type ConditionSnapshot = {
  status: string;
  value: number;
  probability: number;
  expectedClose: string | null;
};
export function conditionsMatch(
  conditions: AutomationDefinition["conditions"],
  snapshot: ConditionSnapshot,
) {
  return conditions.every((c) => {
    if (c.field === "expectedClose")
      return c.operator === "present"
        ? snapshot.expectedClose !== null
        : snapshot.expectedClose === null;
    if (c.field === "status")
      return c.operator === "eq"
        ? snapshot.status === c.value
        : snapshot.status !== c.value;
    return c.operator === "gte"
      ? snapshot[c.field] >= c.value
      : snapshot[c.field] <= c.value;
  });
}
