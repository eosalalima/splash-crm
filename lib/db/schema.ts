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
  primaryKey,
  jsonb,
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
  },
  (t) => [
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
    phone: text("phone").notNull().default(""),
    role: text("role").notNull().default(""),
    notes: text("notes").notNull().default(""),
    companyId: uuid("company_id"),
  },
  (t) => [
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
export const deals = pgTable(
  "crm_deals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ...tenancy(),
    name: text("name").notNull(),
    value: integer("value_cents").notNull().default(0),
    stage: dealStage("stage").notNull().default("Lead"),
    companyId: uuid("company_id"),
  },
  (t) => [
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
