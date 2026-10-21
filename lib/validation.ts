import { z } from "zod";
export const kinds = [
  "contacts",
  "companies",
  "deals",
  "leads",
  "activities",
] as const;
export type Kind = (typeof kinds)[number];
export const kindSchema = z.enum(kinds);
export const idSchema = z.uuid();
const name = z.string().trim().min(1, "Name is required.").max(160);
const companyId = z
  .union([z.uuid(), z.literal("")])
  .transform((v) => v || null);
export const companyInput = z.object({
  name,
  website: z.union([
    z.url().refine((v) => /^https?:\/\//i.test(v), "Use an http or https URL."),
    z.literal(""),
  ]),
  industry: z.string().trim().max(120),
});
export const contactInput = z.object({
  name,
  email: z.email(),
  phone: z.string().trim().max(50),
  role: z.string().trim().max(120),
  notes: z.string().trim().max(5000),
  companyId,
});
export const dealInput = z.object({
  name,
  value: z
    .string()
    .regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount from 0 to 9,999,999.99.")
    .transform((v) => Math.round(Number(v) * 100)),
  stage: z.enum(["Lead", "Qualified", "Proposal", "Won", "Lost"]),
  companyId,
});

const optionalId = z
  .union([z.uuid(), z.literal("")])
  .optional()
  .transform((v) => v || null);
const notes = z.string().trim().max(5000).default("");
const tags = z
  .union([z.string(), z.array(z.string())])
  .default("")
  .transform((v) => [
    ...new Set(
      (Array.isArray(v) ? v : v.split(","))
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ])
  .pipe(z.array(z.string().max(40)).max(12));
const lifecycle = z
  .enum(["prospect", "customer", "inactive"])
  .default("prospect");
export const leadInput = z
  .object({
    name,
    email: z.email().transform((v) => v.trim().toLowerCase()),
    phone: z.string().trim().max(50).default(""),
    companyName: z.string().trim().max(160).default(""),
    role: z.string().trim().max(120).default(""),
    status: z
      .enum(["new", "working", "qualified", "disqualified"])
      .default("new"),
    sourceId: optionalId,
    score: z.coerce.number().int().min(0).max(100).default(0),
    scoreReason: z.string().trim().max(500).default(""),
    notes,
    tags,
  })
  .refine((v) => v.score === 0 || Boolean(v.scoreReason), {
    message: "Explain the manually assigned score.",
    path: ["scoreReason"],
  });
export const activityInput = z
  .object({
    name,
    type: z.enum(["task", "call", "meeting", "email", "note"]),
    priority: z.enum(["low", "normal", "high"]).default("normal"),
    status: z.enum(["open", "completed", "cancelled"]).default("open"),
    dueAt: z
      .union([z.iso.datetime({ offset: true }), z.literal("")])
      .optional()
      .transform((v) => (v ? new Date(v) : null)),
    outcome: z.string().trim().max(2000).default(""),
    notes,
    leadId: optionalId,
    contactId: optionalId,
    companyId: optionalId,
    dealId: optionalId,
  })
  .refine((v) => v.status !== "completed" || Boolean(v.outcome), {
    message: "Add an outcome before completing an activity.",
    path: ["outcome"],
  });
export const companyWorkflowInput = companyInput.extend({
  lifecycle,
  phone: z.string().trim().max(50).default(""),
  address: z.string().trim().max(500).default(""),
  notes,
  tags,
});
export const contactWorkflowInput = contactInput.extend({ lifecycle, tags });
export const opportunityInput = dealInput.extend({
  status: z.enum(["open", "won", "lost"]).optional(),
  probability: z.coerce.number().int().min(0).max(100).default(0),
  expectedClose: z
    .union([z.iso.date(), z.literal("")])
    .optional()
    .transform((v) => v || null),
  contactId: optionalId,
  sourceId: optionalId,
  notes,
  tags,
});
