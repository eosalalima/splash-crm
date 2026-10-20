import { z } from "zod";
export const kinds = ["contacts", "companies", "deals"] as const;
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
