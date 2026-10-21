CREATE TABLE "crm_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"assigned_team_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"outcome" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"lead_id" uuid,
	"contact_id" uuid,
	"company_id" uuid,
	"deal_id" uuid,
	CONSTRAINT "activity_workflow_check" CHECK ("crm_activities"."type" in ('task','call','meeting','email','note') and "crm_activities"."status" in ('open','completed','cancelled') and "crm_activities"."priority" in ('low','normal','high') and (("crm_activities"."status" = 'completed' and "crm_activities"."completed_at" is not null and length(trim("crm_activities"."outcome")) > 0) or ("crm_activities"."status" <> 'completed' and "crm_activities"."completed_at" is null)))
);
--> statement-breakpoint
CREATE TABLE "crm_lead_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "sources_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "crm_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"assigned_team_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"company_name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"source_id" uuid,
	"score" integer DEFAULT 0 NOT NULL,
	"score_reason" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"converted_at" timestamp with time zone,
	"converted_by" text,
	"converted_contact_id" uuid,
	"converted_company_id" uuid,
	"converted_deal_id" uuid,
	CONSTRAINT "leads_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "lead_workflow_check" CHECK ("crm_leads"."status" in ('new','working','qualified','disqualified','converted') and "crm_leads"."score" between 0 and 100 and (("crm_leads"."converted_at" is null and "crm_leads"."status" <> 'converted' and "crm_leads"."converted_contact_id" is null and "crm_leads"."converted_company_id" is null and "crm_leads"."converted_deal_id" is null and "crm_leads"."converted_by" is null) or ("crm_leads"."converted_at" is not null and "crm_leads"."status" = 'converted' and "crm_leads"."converted_contact_id" is not null and "crm_leads"."converted_by" is not null)))
);
--> statement-breakpoint
CREATE TABLE "crm_opportunity_products" (
	"organization_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	CONSTRAINT "crm_opportunity_products_organization_id_deal_id_product_id_pk" PRIMARY KEY("organization_id","deal_id","product_id"),
	CONSTRAINT "opportunity_product_value_check" CHECK ("crm_opportunity_products"."quantity" between 1 and 10000 and "crm_opportunity_products"."unit_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "crm_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sku" text DEFAULT '' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "products_name_unique" UNIQUE("organization_id","name"),
	CONSTRAINT "product_price_check" CHECK ("crm_products"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN "lifecycle" text DEFAULT 'prospect' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD COLUMN "lifecycle" text DEFAULT 'prospect' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "probability" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "expected_close" date;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "contacts_org_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "deals_org_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_organization_id_owner_id_crm_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","owner_id") REFERENCES "public"."crm_memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_organization_id_assigned_team_id_crm_teams_organization_id_id_fk" FOREIGN KEY ("organization_id","assigned_team_id") REFERENCES "public"."crm_teams"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_organization_id_lead_id_crm_leads_organization_id_id_fk" FOREIGN KEY ("organization_id","lead_id") REFERENCES "public"."crm_leads"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_organization_id_contact_id_crm_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "public"."crm_contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_organization_id_company_id_crm_companies_organization_id_id_fk" FOREIGN KEY ("organization_id","company_id") REFERENCES "public"."crm_companies"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_organization_id_deal_id_crm_deals_organization_id_id_fk" FOREIGN KEY ("organization_id","deal_id") REFERENCES "public"."crm_deals"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_sources" ADD CONSTRAINT "crm_lead_sources_organization_id_crm_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."crm_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_organization_id_owner_id_crm_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","owner_id") REFERENCES "public"."crm_memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_organization_id_assigned_team_id_crm_teams_organization_id_id_fk" FOREIGN KEY ("organization_id","assigned_team_id") REFERENCES "public"."crm_teams"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_organization_id_source_id_crm_lead_sources_organization_id_id_fk" FOREIGN KEY ("organization_id","source_id") REFERENCES "public"."crm_lead_sources"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_organization_id_converted_contact_id_crm_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","converted_contact_id") REFERENCES "public"."crm_contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_organization_id_converted_company_id_crm_companies_organization_id_id_fk" FOREIGN KEY ("organization_id","converted_company_id") REFERENCES "public"."crm_companies"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_organization_id_converted_deal_id_crm_deals_organization_id_id_fk" FOREIGN KEY ("organization_id","converted_deal_id") REFERENCES "public"."crm_deals"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_opportunity_products" ADD CONSTRAINT "crm_opportunity_products_organization_id_deal_id_crm_deals_organization_id_id_fk" FOREIGN KEY ("organization_id","deal_id") REFERENCES "public"."crm_deals"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_opportunity_products" ADD CONSTRAINT "crm_opportunity_products_organization_id_product_id_crm_products_organization_id_id_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."crm_products"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_products" ADD CONSTRAINT "crm_products_organization_id_crm_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."crm_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_tenant_idx" ON "crm_activities" USING btree ("organization_id","deleted_at","created_at");--> statement-breakpoint
CREATE INDEX "leads_tenant_idx" ON "crm_leads" USING btree ("organization_id","deleted_at","created_at");--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_contact_id_crm_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "public"."crm_contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_source_id_crm_lead_sources_organization_id_id_fk" FOREIGN KEY ("organization_id","source_id") REFERENCES "public"."crm_lead_sources"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD CONSTRAINT "companies_lifecycle_check" CHECK ("crm_companies"."lifecycle" in ('prospect','customer','inactive'));--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "contacts_lifecycle_check" CHECK ("crm_contacts"."lifecycle" in ('prospect','customer','inactive'));--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "deals_workflow_check" CHECK ("crm_deals"."status" in ('open','won','lost') and "crm_deals"."probability" between 0 and 100 and "crm_deals"."value_cents" >= 0);
--> statement-breakpoint
-- Preserve legacy outcome meaning without inventing funnel history.
UPDATE crm_deals SET status = CASE WHEN stage = 'Won' THEN 'won' WHEN stage = 'Lost' THEN 'lost' ELSE 'open' END;
