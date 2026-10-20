import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  unique,
  foreignKey,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
export const dealStage = pgEnum("deal_stage", [
  "Lead",
  "Qualified",
  "Proposal",
  "Won",
  "Lost",
]);
const audit = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const companies = pgTable(
  "crm_companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    website: text("website").notNull().default(""),
    industry: text("industry").notNull().default(""),
    ...audit(),
  },
  (t) => [
    index("companies_owner_idx").on(t.ownerId),
    unique("companies_id_owner_unique").on(t.id, t.ownerId),
  ],
);
export const contacts = pgTable(
  "crm_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull().default(""),
    role: text("role").notNull().default(""),
    notes: text("notes").notNull().default(""),
    companyId: uuid("company_id"),
    ...audit(),
  },
  (t) => [
    index("contacts_owner_idx").on(t.ownerId),
    index("contacts_company_idx").on(t.companyId),
    foreignKey({
      columns: [t.companyId, t.ownerId],
      foreignColumns: [companies.id, companies.ownerId],
      name: "contacts_company_owner_fk",
    }).onDelete("restrict"),
  ],
);
export const deals = pgTable(
  "crm_deals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    value: integer("value_cents").notNull().default(0),
    stage: dealStage("stage").notNull().default("Lead"),
    companyId: uuid("company_id"),
    ...audit(),
  },
  (t) => [
    index("deals_owner_idx").on(t.ownerId),
    index("deals_company_idx").on(t.companyId),
    foreignKey({
      columns: [t.companyId, t.ownerId],
      foreignColumns: [companies.id, companies.ownerId],
      name: "deals_company_owner_fk",
    }).onDelete("restrict"),
  ],
);
export const companyRelations = relations(companies, ({ many }) => ({
  contacts: many(contacts),
  deals: many(deals),
}));
export const contactRelations = relations(contacts, ({ one }) => ({
  company: one(companies, {
    fields: [contacts.companyId, contacts.ownerId],
    references: [companies.id, companies.ownerId],
  }),
}));
export const dealRelations = relations(deals, ({ one }) => ({
  company: one(companies, {
    fields: [deals.companyId, deals.ownerId],
    references: [companies.id, companies.ownerId],
  }),
}));
