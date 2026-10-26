CREATE TABLE "crm_automation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"action_id" text NOT NULL,
	"kind" text NOT NULL,
	"effect_id" uuid NOT NULL,
	"recipient_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_actions_identity" UNIQUE("organization_id","run_id","action_id")
);
--> statement-breakpoint
CREATE TABLE "crm_automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_runs_identity" UNIQUE("organization_id","event_id","workflow_version_id"),
	CONSTRAINT "automation_runs_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "automation_runs_status" CHECK ("crm_automation_runs"."status" in ('pending','completed','skipped','failed'))
);
--> statement-breakpoint
CREATE TABLE "crm_automation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"funnel_version_id" uuid NOT NULL,
	"stage_id" text NOT NULL,
	"definition" jsonb NOT NULL,
	"published_by" text NOT NULL,
	"command_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_versions_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "automation_versions_number_unique" UNIQUE("organization_id","automation_id","number"),
	CONSTRAINT "automation_versions_command_unique" UNIQUE("organization_id","command_key")
);
--> statement-breakpoint
CREATE TABLE "crm_automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automations_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "crm_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"recipient_id" text NOT NULL,
	"deal_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"action_id" text NOT NULL,
	"message" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_action_unique" UNIQUE("organization_id","run_id","action_id")
);
--> statement-breakpoint
ALTER TABLE "crm_outbox_events" ADD COLUMN "plan" jsonb;--> statement-breakpoint
ALTER TABLE "crm_outbox_events" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_outbox_events" ADD COLUMN "available_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_outbox_events" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "crm_outbox_events" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_outbox_events" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "crm_outbox_events" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_outbox_events" ADD CONSTRAINT "outbox_org_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "crm_automation_actions" ADD CONSTRAINT "crm_automation_actions_organization_id_run_id_crm_automation_runs_organization_id_id_fk" FOREIGN KEY ("organization_id","run_id") REFERENCES "public"."crm_automation_runs"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_automation_actions" ADD CONSTRAINT "crm_automation_actions_organization_id_recipient_id_crm_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","recipient_id") REFERENCES "public"."crm_memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_automation_runs" ADD CONSTRAINT "crm_automation_runs_organization_id_event_id_crm_outbox_events_organization_id_id_fk" FOREIGN KEY ("organization_id","event_id") REFERENCES "public"."crm_outbox_events"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_automation_runs" ADD CONSTRAINT "crm_automation_runs_organization_id_workflow_version_id_crm_automation_versions_organization_id_id_fk" FOREIGN KEY ("organization_id","workflow_version_id") REFERENCES "public"."crm_automation_versions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_automation_versions" ADD CONSTRAINT "crm_automation_versions_organization_id_automation_id_crm_automations_organization_id_id_fk" FOREIGN KEY ("organization_id","automation_id") REFERENCES "public"."crm_automations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_automation_versions" ADD CONSTRAINT "crm_automation_versions_organization_id_funnel_version_id_crm_funnel_versions_organization_id_id_fk" FOREIGN KEY ("organization_id","funnel_version_id") REFERENCES "public"."crm_funnel_versions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_automation_versions" ADD CONSTRAINT "crm_automation_versions_organization_id_published_by_crm_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","published_by") REFERENCES "public"."crm_memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_automations" ADD CONSTRAINT "crm_automations_organization_id_crm_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."crm_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notifications" ADD CONSTRAINT "crm_notifications_organization_id_recipient_id_crm_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","recipient_id") REFERENCES "public"."crm_memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notifications" ADD CONSTRAINT "crm_notifications_organization_id_deal_id_crm_deals_organization_id_id_fk" FOREIGN KEY ("organization_id","deal_id") REFERENCES "public"."crm_deals"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notifications" ADD CONSTRAINT "crm_notifications_organization_id_run_id_crm_automation_runs_organization_id_id_fk" FOREIGN KEY ("organization_id","run_id") REFERENCES "public"."crm_automation_runs"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "crm_notifications" USING btree ("organization_id","recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "outbox_claim_idx" ON "crm_outbox_events" USING btree ("status","available_at","lease_until");--> statement-breakpoint
ALTER TABLE "crm_outbox_events" ADD CONSTRAINT "outbox_processing_check" CHECK ("crm_outbox_events"."status" in ('pending','processing','completed','failed') and "crm_outbox_events"."attempts" >= 0 and (("crm_outbox_events"."status" = 'processing' and "crm_outbox_events"."lease_token" is not null and "crm_outbox_events"."lease_until" is not null) or ("crm_outbox_events"."status" <> 'processing' and "crm_outbox_events"."lease_token" is null and "crm_outbox_events"."lease_until" is null)));
--> statement-breakpoint
CREATE TRIGGER crm_automation_versions_immutable BEFORE UPDATE OR DELETE ON crm_automation_versions FOR EACH ROW EXECUTE FUNCTION crm_prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER crm_automation_versions_no_truncate BEFORE TRUNCATE ON crm_automation_versions FOR EACH STATEMENT EXECUTE FUNCTION crm_prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER crm_automation_actions_immutable BEFORE UPDATE OR DELETE ON crm_automation_actions FOR EACH ROW EXECUTE FUNCTION crm_prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER crm_automation_actions_no_truncate BEFORE TRUNCATE ON crm_automation_actions FOR EACH STATEMENT EXECUTE FUNCTION crm_prevent_history_mutation();
--> statement-breakpoint
CREATE FUNCTION crm_outbox_processing_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Outbox provenance cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','attempts','available_at','lease_token','lease_until','last_error','completed_at','plan']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','attempts','available_at','lease_token','lease_until','last_error','completed_at','plan'])
    OR (OLD.plan IS NOT NULL AND NEW.plan IS DISTINCT FROM OLD.plan) THEN
    RAISE EXCEPTION 'Outbox event and initialized evaluation plan are immutable';
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER crm_outbox_processing_only BEFORE UPDATE OR DELETE ON crm_outbox_events FOR EACH ROW EXECUTE FUNCTION crm_outbox_processing_only();
--> statement-breakpoint
CREATE TRIGGER crm_outbox_no_truncate BEFORE TRUNCATE ON crm_outbox_events FOR EACH STATEMENT EXECUTE FUNCTION crm_prevent_history_mutation();
--> statement-breakpoint
CREATE FUNCTION crm_automation_run_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Automation run history cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','error','completed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','error','completed_at']) THEN
    RAISE EXCEPTION 'Automation run identity is immutable';
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER crm_automation_run_identity BEFORE UPDATE OR DELETE ON crm_automation_runs FOR EACH ROW EXECUTE FUNCTION crm_automation_run_identity();
--> statement-breakpoint
CREATE TRIGGER crm_automation_runs_no_truncate BEFORE TRUNCATE ON crm_automation_runs FOR EACH STATEMENT EXECUTE FUNCTION crm_prevent_history_mutation();

--> statement-breakpoint
CREATE FUNCTION crm_notification_read_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Notification provenance cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-'read_at') IS DISTINCT FROM (to_jsonb(OLD)-'read_at') OR (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at) THEN
    RAISE EXCEPTION 'Only the first notification read acknowledgement may change';
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER crm_notification_read_only BEFORE UPDATE OR DELETE ON crm_notifications FOR EACH ROW EXECUTE FUNCTION crm_notification_read_only();
--> statement-breakpoint
CREATE TRIGGER crm_notifications_no_truncate BEFORE TRUNCATE ON crm_notifications FOR EACH STATEMENT EXECUTE FUNCTION crm_prevent_history_mutation();
