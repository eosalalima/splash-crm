CREATE TYPE "public"."workspace_visibility" AS ENUM('own', 'team', 'organization');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('administrator', 'manager', 'representative', 'read_only');--> statement-breakpoint
CREATE TABLE "crm_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"before_data" jsonb,
	"after_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "workspace_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "crm_memberships" (
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT 'Member' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"role" "workspace_role" NOT NULL,
	"scope" "workspace_visibility" NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_memberships_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "crm_organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legacy_owner_id" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_organizations_legacy_owner_id_unique" UNIQUE("legacy_owner_id")
);
--> statement-breakpoint
CREATE TABLE "crm_team_memberships" (
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "crm_team_memberships_organization_id_team_id_user_id_pk" PRIMARY KEY("organization_id","team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "crm_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "teams_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
ALTER TABLE "crm_contacts" DROP CONSTRAINT "contacts_company_owner_fk";
--> statement-breakpoint
ALTER TABLE "crm_deals" DROP CONSTRAINT "deals_company_owner_fk";
--> statement-breakpoint
ALTER TABLE "crm_companies" DROP CONSTRAINT "companies_id_owner_unique";--> statement-breakpoint
DROP INDEX "companies_owner_idx";--> statement-breakpoint
DROP INDEX "contacts_owner_idx";--> statement-breakpoint
DROP INDEX "contacts_company_idx";--> statement-breakpoint
DROP INDEX "deals_owner_idx";--> statement-breakpoint
DROP INDEX "deals_company_idx";--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN "assigned_team_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD COLUMN "assigned_team_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "assigned_team_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
-- One private organization per historical owner; never group owners by email domain.
INSERT INTO crm_organizations (name, legacy_owner_id)
SELECT 'Private workspace', owner_id FROM (
 SELECT owner_id FROM crm_companies UNION SELECT owner_id FROM crm_contacts UNION SELECT owner_id FROM crm_deals
) owners;
INSERT INTO crm_memberships (organization_id, user_id, name, role, scope)
SELECT id, legacy_owner_id, 'Workspace administrator', 'administrator', 'organization' FROM crm_organizations;
UPDATE crm_companies r SET organization_id = o.id FROM crm_organizations o WHERE o.legacy_owner_id = r.owner_id;
UPDATE crm_contacts r SET organization_id = o.id FROM crm_organizations o WHERE o.legacy_owner_id = r.owner_id;
UPDATE crm_deals r SET organization_id = o.id FROM crm_organizations o WHERE o.legacy_owner_id = r.owner_id;
ALTER TABLE crm_companies ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE crm_contacts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE crm_deals ALTER COLUMN organization_id SET NOT NULL;
INSERT INTO crm_audit_events (organization_id, actor_id, action, entity, entity_id, after_data)
SELECT id, NULL, 'workspace.migrated', 'organization', id::text,
 jsonb_build_object('baseline', true, 'legacyOwnerId', legacy_owner_id,
 'companies', (SELECT count(*) FROM crm_companies WHERE organization_id = o.id),
 'contacts', (SELECT count(*) FROM crm_contacts WHERE organization_id = o.id),
 'deals', (SELECT count(*) FROM crm_deals WHERE organization_id = o.id))
FROM crm_organizations o;

--> statement-breakpoint
ALTER TABLE "crm_companies" ADD CONSTRAINT "companies_org_id_unique" UNIQUE("organization_id","id");
--> statement-breakpoint
ALTER TABLE "crm_audit_events" ADD CONSTRAINT "crm_audit_events_organization_id_crm_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."crm_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_invitations" ADD CONSTRAINT "crm_invitations_organization_id_crm_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."crm_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_memberships" ADD CONSTRAINT "crm_memberships_organization_id_crm_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."crm_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_team_memberships" ADD CONSTRAINT "crm_team_memberships_organization_id_team_id_crm_teams_organization_id_id_fk" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."crm_teams"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_team_memberships" ADD CONSTRAINT "crm_team_memberships_organization_id_user_id_crm_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."crm_memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_teams" ADD CONSTRAINT "crm_teams_organization_id_crm_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."crm_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_org_time_idx" ON "crm_audit_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "invitation_org_idx" ON "crm_invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "crm_memberships" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_organization_id_owner_id_crm_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","owner_id") REFERENCES "public"."crm_memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_organization_id_assigned_team_id_crm_teams_organization_id_id_fk" FOREIGN KEY ("organization_id","assigned_team_id") REFERENCES "public"."crm_teams"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_organization_id_owner_id_crm_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","owner_id") REFERENCES "public"."crm_memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_organization_id_assigned_team_id_crm_teams_organization_id_id_fk" FOREIGN KEY ("organization_id","assigned_team_id") REFERENCES "public"."crm_teams"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "contacts_company_tenant_fk" FOREIGN KEY ("organization_id","company_id") REFERENCES "public"."crm_companies"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_owner_id_crm_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","owner_id") REFERENCES "public"."crm_memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_assigned_team_id_crm_teams_organization_id_id_fk" FOREIGN KEY ("organization_id","assigned_team_id") REFERENCES "public"."crm_teams"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "deals_company_tenant_fk" FOREIGN KEY ("organization_id","company_id") REFERENCES "public"."crm_companies"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_tenant_idx" ON "crm_companies" USING btree ("organization_id","deleted_at","created_at");--> statement-breakpoint
CREATE INDEX "contacts_tenant_idx" ON "crm_contacts" USING btree ("organization_id","deleted_at","created_at");--> statement-breakpoint
CREATE INDEX "deals_tenant_idx" ON "crm_deals" USING btree ("organization_id","deleted_at","created_at");--> statement-breakpoint

-- Audit is append-only, including for callers outside the application service.
CREATE FUNCTION crm_prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events are append-only'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER crm_audit_immutable BEFORE UPDATE OR DELETE ON crm_audit_events
FOR EACH ROW EXECUTE FUNCTION crm_prevent_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER crm_audit_no_truncate BEFORE TRUNCATE ON crm_audit_events
FOR EACH STATEMENT EXECUTE FUNCTION crm_prevent_audit_mutation();
