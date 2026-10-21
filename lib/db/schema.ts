import { relations, sql } from "drizzle-orm";
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
  primaryKey,
  jsonb,
  date,
  check,
} from "drizzle-orm/pg-core";
export const dealStage = pgEnum("deal_stage", [
  "Lead",
  "Qualified",
  "Proposal",
  "Won",
  "Lost",
]);
export const workspaceRole = pgEnum("workspace_role", [
  "administrator",
  "manager",
  "representative",
  "read_only",
]);
export const visibility = pgEnum("workspace_visibility", [
  "own",
  "team",
  "organization",
]);
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const organizations = pgTable("crm_organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  legacyOwnerId: text("legacy_owner_id").unique(),
  timezone: text("timezone").notNull().default("UTC"),
  currency: text("currency").notNull().default("USD"),
  ...timestamps(),
});
export const memberships = pgTable(
  "crm_memberships",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id").notNull(),
    name: text("name").notNull().default("Member"),
    email: text("email").notNull().default(""),
    role: workspaceRole("role").notNull(),
    scope: visibility("scope").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    index("memberships_user_idx").on(t.userId),
  ],
);
export const teams = pgTable(
  "crm_teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("teams_org_id_unique").on(t.organizationId, t.id),
    unique("teams_name_unique").on(t.organizationId, t.name),
  ],
);
export const teamMemberships = pgTable(
  "crm_team_memberships",
  {
    organizationId: uuid("organization_id").notNull(),
    teamId: uuid("team_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.teamId, t.userId] }),
    foreignKey({
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.userId],
      foreignColumns: [memberships.organizationId, memberships.userId],
    }),
  ],
);
export const invitations = pgTable(
  "crm_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    email: text("email").notNull(),
    role: workspaceRole("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("invitation_org_idx").on(t.organizationId)],
);
export const auditEvents = pgTable(
  "crm_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    beforeData: jsonb("before_data").$type<Record<string, unknown> | null>(),
    afterData: jsonb("after_data").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("audit_org_time_idx").on(t.organizationId, t.createdAt)],
);
const tenancy = () => ({
  organizationId: uuid("organization_id").notNull(),
  ownerId: text("owner_id").notNull(),
  assignedTeamId: uuid("assigned_team_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps(),
});
export const companies = pgTable(
  "crm_companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ...tenancy(),
    name: text("name").notNull(),
    website: text("website").notNull().default(""),
    industry: text("industry").notNull().default(""),
    lifecycle: text("lifecycle").notNull().default("prospect"),
    phone: text("phone").notNull().default(""),
    address: text("address").notNull().default(""),
    notes: text("notes").notNull().default(""),
    tags: text("tags").array().notNull().default([]),
  },
  (t) => [
    check(
      "companies_lifecycle_check",
      sql`${t.lifecycle} in ('prospect','customer','inactive')`,
    ),
    index("companies_tenant_idx").on(
      t.organizationId,
      t.deletedAt,
      t.createdAt,
    ),
    unique("companies_org_id_unique").on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.ownerId],
      foreignColumns: [memberships.organizationId, memberships.userId],
    }),
    foreignKey({
      columns: [t.organizationId, t.assignedTeamId],
      foreignColumns: [teams.organizationId, teams.id],
    }),
  ],
);
export const contacts = pgTable(
  "crm_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ...tenancy(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    lifecycle: text("lifecycle").notNull().default("prospect"),
    tags: text("tags").array().notNull().default([]),
    phone: text("phone").notNull().default(""),
    role: text("role").notNull().default(""),
    notes: text("notes").notNull().default(""),
    companyId: uuid("company_id"),
  },
  (t) => [
    check(
      "contacts_lifecycle_check",
      sql`${t.lifecycle} in ('prospect','customer','inactive')`,
    ),
    unique("contacts_org_id_unique").on(t.organizationId, t.id),
    index("contacts_tenant_idx").on(t.organizationId, t.deletedAt, t.createdAt),
    foreignKey({
      columns: [t.organizationId, t.ownerId],
      foreignColumns: [memberships.organizationId, memberships.userId],
    }),
    foreignKey({
      columns: [t.organizationId, t.assignedTeamId],
      foreignColumns: [teams.organizationId, teams.id],
    }),
    foreignKey({
      name: "contacts_company_tenant_fk",
      columns: [t.organizationId, t.companyId],
      foreignColumns: [companies.organizationId, companies.id],
    }).onDelete("restrict"),
  ],
);
export const leadSources = pgTable(
  "crm_lead_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("sources_org_id_unique").on(t.organizationId, t.id),
    unique("sources_name_unique").on(t.organizationId, t.name),
  ],
);
export const products = pgTable(
  "crm_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    sku: text("sku").notNull().default(""),
    price: integer("price_cents").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    check("product_price_check", sql`${t.price} >= 0`),
    unique("products_org_id_unique").on(t.organizationId, t.id),
    unique("products_name_unique").on(t.organizationId, t.name),
  ],
);
export const deals = pgTable(
  "crm_deals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ...tenancy(),
    name: text("name").notNull(),
    value: integer("value_cents").notNull().default(0),
    stage: dealStage("stage").notNull().default("Lead"),
    status: text("status").notNull().default("open"),
    probability: integer("probability").notNull().default(0),
    expectedClose: date("expected_close"),
    sourceId: uuid("source_id"),
    contactId: uuid("contact_id"),
    notes: text("notes").notNull().default(""),
    tags: text("tags").array().notNull().default([]),
    companyId: uuid("company_id"),
  },
  (t) => [
    check(
      "deals_workflow_check",
      sql`${t.status} in ('open','won','lost') and ${t.probability} between 0 and 100 and ${t.value} >= 0`,
    ),
    unique("deals_org_id_unique").on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.sourceId],
      foreignColumns: [leadSources.organizationId, leadSources.id],
    }),
    index("deals_tenant_idx").on(t.organizationId, t.deletedAt, t.createdAt),
    foreignKey({
      columns: [t.organizationId, t.ownerId],
      foreignColumns: [memberships.organizationId, memberships.userId],
    }),
    foreignKey({
      columns: [t.organizationId, t.assignedTeamId],
      foreignColumns: [teams.organizationId, teams.id],
    }),
    foreignKey({
      name: "deals_company_tenant_fk",
      columns: [t.organizationId, t.companyId],
      foreignColumns: [companies.organizationId, companies.id],
    }).onDelete("restrict"),
  ],
);
export const companyRelations = relations(companies, ({ many }) => ({
  contacts: many(contacts),
  deals: many(deals),
}));
export const contactRelations = relations(contacts, ({ one }) => ({
  company: one(companies, {
    fields: [contacts.organizationId, contacts.companyId],
    references: [companies.organizationId, companies.id],
  }),
}));
export const dealRelations = relations(deals, ({ one }) => ({
  company: one(companies, {
    fields: [deals.organizationId, deals.companyId],
    references: [companies.organizationId, companies.id],
  }),
}));

export const leads = pgTable(
  "crm_leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ...tenancy(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull().default(""),
    companyName: text("company_name").notNull().default(""),
    role: text("role").notNull().default(""),
    status: text("status").notNull().default("new"),
    sourceId: uuid("source_id"),
    score: integer("score").notNull().default(0),
    scoreReason: text("score_reason").notNull().default(""),
    notes: text("notes").notNull().default(""),
    tags: text("tags").array().notNull().default([]),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    convertedBy: text("converted_by"),
    convertedContactId: uuid("converted_contact_id"),
    convertedCompanyId: uuid("converted_company_id"),
    convertedDealId: uuid("converted_deal_id"),
  },
  (t) => [
    check(
      "lead_workflow_check",
      sql`${t.status} in ('new','working','qualified','disqualified','converted') and ${t.score} between 0 and 100 and ((${t.convertedAt} is null and ${t.status} <> 'converted' and ${t.convertedContactId} is null and ${t.convertedCompanyId} is null and ${t.convertedDealId} is null and ${t.convertedBy} is null) or (${t.convertedAt} is not null and ${t.status} = 'converted' and ${t.convertedContactId} is not null and ${t.convertedBy} is not null))`,
    ),
    unique("leads_org_id_unique").on(t.organizationId, t.id),
    index("leads_tenant_idx").on(t.organizationId, t.deletedAt, t.createdAt),
    foreignKey({
      columns: [t.organizationId, t.ownerId],
      foreignColumns: [memberships.organizationId, memberships.userId],
    }),
    foreignKey({
      columns: [t.organizationId, t.assignedTeamId],
      foreignColumns: [teams.organizationId, teams.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.sourceId],
      foreignColumns: [leadSources.organizationId, leadSources.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.convertedContactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.convertedCompanyId],
      foreignColumns: [companies.organizationId, companies.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.convertedDealId],
      foreignColumns: [deals.organizationId, deals.id],
    }),
  ],
);
export const opportunityProducts = pgTable(
  "crm_opportunity_products",
  {
    organizationId: uuid("organization_id").notNull(),
    dealId: uuid("deal_id").notNull(),
    productId: uuid("product_id").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price_cents").notNull(),
  },
  (t) => [
    check(
      "opportunity_product_value_check",
      sql`${t.quantity} between 1 and 10000 and ${t.unitPrice} >= 0`,
    ),
    primaryKey({ columns: [t.organizationId, t.dealId, t.productId] }),
    foreignKey({
      columns: [t.organizationId, t.dealId],
      foreignColumns: [deals.organizationId, deals.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.productId],
      foreignColumns: [products.organizationId, products.id],
    }),
  ],
);
export const activities = pgTable(
  "crm_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ...tenancy(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("open"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    outcome: text("outcome").notNull().default(""),
    notes: text("notes").notNull().default(""),
    leadId: uuid("lead_id"),
    contactId: uuid("contact_id"),
    companyId: uuid("company_id"),
    dealId: uuid("deal_id"),
  },
  (t) => [
    check(
      "activity_workflow_check",
      sql`${t.type} in ('task','call','meeting','email','note') and ${t.status} in ('open','completed','cancelled') and ${t.priority} in ('low','normal','high') and ((${t.status} = 'completed' and ${t.completedAt} is not null and length(trim(${t.outcome})) > 0) or (${t.status} <> 'completed' and ${t.completedAt} is null))`,
    ),
    index("activities_tenant_idx").on(
      t.organizationId,
      t.deletedAt,
      t.createdAt,
    ),
    foreignKey({
      columns: [t.organizationId, t.ownerId],
      foreignColumns: [memberships.organizationId, memberships.userId],
    }),
    foreignKey({
      columns: [t.organizationId, t.assignedTeamId],
      foreignColumns: [teams.organizationId, teams.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.leadId],
      foreignColumns: [leads.organizationId, leads.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.companyId],
      foreignColumns: [companies.organizationId, companies.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.dealId],
      foreignColumns: [deals.organizationId, deals.id],
    }),
  ],
);
