CREATE TYPE "public"."deal_stage" AS ENUM('Lead', 'Qualified', 'Proposal', 'Won', 'Lost');--> statement-breakpoint
CREATE TABLE "crm_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_id_owner_unique" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "crm_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"value_cents" integer DEFAULT 0 NOT NULL,
	"stage" "deal_stage" DEFAULT 'Lead' NOT NULL,
	"company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "contacts_company_owner_fk" FOREIGN KEY ("company_id","owner_id") REFERENCES "public"."crm_companies"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "deals_company_owner_fk" FOREIGN KEY ("company_id","owner_id") REFERENCES "public"."crm_companies"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_owner_idx" ON "crm_companies" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "contacts_owner_idx" ON "crm_contacts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "contacts_company_idx" ON "crm_contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "deals_owner_idx" ON "crm_deals" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "deals_company_idx" ON "crm_deals" USING btree ("company_id");