CREATE TABLE "crm_funnel_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"funnel_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"current_stage" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"baseline" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "instances_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "instances_version_id_unique" UNIQUE("organization_id","version_id","id"),
	CONSTRAINT "instance_state_check" CHECK ("crm_funnel_instances"."state" in ('active','successful','unsuccessful') and "crm_funnel_instances"."revision" >= 1 and (("crm_funnel_instances"."state" = 'active' and "crm_funnel_instances"."completed_at" is null) or ("crm_funnel_instances"."state" <> 'active' and "crm_funnel_instances"."completed_at" is not null)))
);
--> statement-breakpoint
CREATE TABLE "crm_funnel_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"funnel_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"layout" jsonb NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"command_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	CONSTRAINT "versions_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "versions_funnel_id_unique" UNIQUE("organization_id","funnel_id","id"),
	CONSTRAINT "versions_number_unique" UNIQUE("organization_id","funnel_id","number"),
	CONSTRAINT "versions_command_unique" UNIQUE("organization_id","command_key")
);
--> statement-breakpoint
CREATE TABLE "crm_funnels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'custom' NOT NULL,
	"draft" jsonb NOT NULL,
	"layout" jsonb DEFAULT '{"orientation":"horizontal"}'::jsonb NOT NULL,
	"draft_revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funnels_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "crm_outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"transition_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_transition_unique" UNIQUE("organization_id","transition_id")
);
--> statement-breakpoint
CREATE TABLE "crm_stage_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"stage_id" text NOT NULL,
	"entered_at" timestamp with time zone,
	"exited_at" timestamp with time zone,
	"actor_id" text,
	"baseline" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "visits_stage_unique" UNIQUE("organization_id","instance_id","stage_id"),
	CONSTRAINT "visits_time_check" CHECK (("crm_stage_visits"."entered_at" is not null or "crm_stage_visits"."baseline" = 1) and ("crm_stage_visits"."exited_at" is null or "crm_stage_visits"."entered_at" is null or "crm_stage_visits"."exited_at" >= "crm_stage_visits"."entered_at"))
);
--> statement-breakpoint
CREATE TABLE "crm_transition_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"expected_revision" integer NOT NULL,
	"revision" integer NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text,
	"comment" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"command_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transitions_command_unique" UNIQUE("organization_id","command_key"),
	CONSTRAINT "transitions_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "transitions_revision_unique" UNIQUE("organization_id","instance_id","revision")
);
--> statement-breakpoint
ALTER TABLE "crm_funnel_instances" ADD CONSTRAINT "crm_funnel_instances_organization_id_deal_id_crm_deals_organization_id_id_fk" FOREIGN KEY ("organization_id","deal_id") REFERENCES "public"."crm_deals"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_funnel_instances" ADD CONSTRAINT "crm_funnel_instances_organization_id_funnel_id_version_id_crm_funnel_versions_organization_id_funnel_id_id_fk" FOREIGN KEY ("organization_id","funnel_id","version_id") REFERENCES "public"."crm_funnel_versions"("organization_id","funnel_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_funnel_versions" ADD CONSTRAINT "crm_funnel_versions_organization_id_funnel_id_crm_funnels_organization_id_id_fk" FOREIGN KEY ("organization_id","funnel_id") REFERENCES "public"."crm_funnels"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_funnels" ADD CONSTRAINT "crm_funnels_organization_id_crm_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."crm_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_outbox_events" ADD CONSTRAINT "crm_outbox_events_organization_id_transition_id_crm_transition_events_organization_id_id_fk" FOREIGN KEY ("organization_id","transition_id") REFERENCES "public"."crm_transition_events"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_stage_visits" ADD CONSTRAINT "crm_stage_visits_organization_id_version_id_instance_id_crm_funnel_instances_organization_id_version_id_id_fk" FOREIGN KEY ("organization_id","version_id","instance_id") REFERENCES "public"."crm_funnel_instances"("organization_id","version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_transition_events" ADD CONSTRAINT "crm_transition_events_organization_id_version_id_instance_id_crm_funnel_instances_organization_id_version_id_id_fk" FOREIGN KEY ("organization_id","version_id","instance_id") REFERENCES "public"."crm_funnel_instances"("organization_id","version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "instances_one_active_deal" ON "crm_funnel_instances" USING btree ("organization_id","deal_id") WHERE "crm_funnel_instances"."state" = 'active';--> statement-breakpoint
CREATE INDEX "funnels_tenant_idx" ON "crm_funnels" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "visits_one_open" ON "crm_stage_visits" USING btree ("organization_id","instance_id") WHERE "crm_stage_visits"."exited_at" is null;--> statement-breakpoint
CREATE INDEX "visits_instance_idx" ON "crm_stage_visits" USING btree ("organization_id","instance_id","entered_at");--> statement-breakpoint
CREATE INDEX "transitions_instance_idx" ON "crm_transition_events" USING btree ("organization_id","instance_id","created_at");
--> statement-breakpoint
-- Preserve current legacy stage only; no historical entry timestamps or transitions are invented.
INSERT INTO crm_funnels(organization_id,name,description,kind,draft,archived_at)
SELECT DISTINCT organization_id,'Legacy sales pipeline','Migration baseline: previous stage entry time is unknown. Retired for new enrollments.','legacy', '{"stages": [{"id": "lead", "name": "Lead", "kind": "entry", "probability": 0, "targetHours": 0, "responsibleRole": "representative", "entryFields": [], "exitFields": [], "entryActivities": [], "exitActivities": []}, {"id": "qualified", "name": "Qualified", "kind": "normal", "probability": 0, "targetHours": 0, "responsibleRole": "representative", "entryFields": [], "exitFields": [], "entryActivities": [], "exitActivities": []}, {"id": "proposal", "name": "Proposal", "kind": "normal", "probability": 0, "targetHours": 0, "responsibleRole": "representative", "entryFields": [], "exitFields": [], "entryActivities": [], "exitActivities": []}, {"id": "won", "name": "Won", "kind": "successful", "probability": 100, "targetHours": 0, "responsibleRole": "representative", "entryFields": [], "exitFields": [], "entryActivities": [], "exitActivities": []}, {"id": "lost", "name": "Lost", "kind": "unsuccessful", "probability": 0, "targetHours": 0, "responsibleRole": "representative", "entryFields": [], "exitFields": [], "entryActivities": [], "exitActivities": []}], "transitions": [{"from": "lead", "to": "qualified"}, {"from": "lead", "to": "lost"}, {"from": "qualified", "to": "proposal"}, {"from": "qualified", "to": "lost"}, {"from": "proposal", "to": "won"}, {"from": "proposal", "to": "lost"}], "lossReasons": ["Budget withdrawn", "Not a fit", "No response", "Other"]}'::jsonb,now()
FROM crm_deals WHERE deleted_at IS NULL;
--> statement-breakpoint
INSERT INTO crm_funnel_versions(organization_id,funnel_id,number,definition,layout,command_key,request_hash)
SELECT organization_id,id,1,draft,layout,gen_random_uuid(),'legacy-migration-baseline'
FROM crm_funnels WHERE kind='legacy';
--> statement-breakpoint
INSERT INTO crm_funnel_instances(organization_id,deal_id,funnel_id,version_id,current_stage,state,completed_at,baseline)
SELECT d.organization_id,d.id,f.id,v.id,lower(d.stage::text),CASE WHEN d.stage='Won' THEN 'successful' WHEN d.stage='Lost' THEN 'unsuccessful' ELSE 'active' END,CASE WHEN d.stage IN ('Won','Lost') THEN now() ELSE NULL END,1
FROM crm_deals d JOIN crm_funnels f ON f.organization_id=d.organization_id AND f.kind='legacy'
JOIN crm_funnel_versions v ON v.organization_id=f.organization_id AND v.funnel_id=f.id AND v.number=1 WHERE d.deleted_at IS NULL;
--> statement-breakpoint
INSERT INTO crm_stage_visits(organization_id,instance_id,version_id,stage_id,entered_at,exited_at,baseline)
SELECT organization_id,id,version_id,current_stage,NULL,CASE WHEN state='active' THEN NULL ELSE now() END,1 FROM crm_funnel_instances WHERE baseline=1;
--> statement-breakpoint
INSERT INTO crm_audit_events(organization_id,action,entity,entity_id,after_data)
SELECT f.organization_id,'funnel.legacy_baseline','funnels',f.id::text,jsonb_build_object('baseline',true,'historicalEntryUnknown',true,'instances',(SELECT count(*) FROM crm_funnel_instances i WHERE i.funnel_id=f.id)) FROM crm_funnels f WHERE f.kind='legacy';
--> statement-breakpoint
CREATE FUNCTION crm_prevent_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Published definitions and transition history are immutable'; END; $$;
--> statement-breakpoint
CREATE TRIGGER crm_versions_immutable BEFORE UPDATE OR DELETE ON crm_funnel_versions FOR EACH ROW EXECUTE FUNCTION crm_prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER crm_versions_no_truncate BEFORE TRUNCATE ON crm_funnel_versions FOR EACH STATEMENT EXECUTE FUNCTION crm_prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER crm_transitions_immutable BEFORE UPDATE OR DELETE ON crm_transition_events FOR EACH ROW EXECUTE FUNCTION crm_prevent_history_mutation();
--> statement-breakpoint
CREATE TRIGGER crm_transitions_no_truncate BEFORE TRUNCATE ON crm_transition_events FOR EACH STATEMENT EXECUTE FUNCTION crm_prevent_history_mutation();
--> statement-breakpoint
CREATE FUNCTION crm_close_visit_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Stage visits cannot be deleted or truncated'; END IF;
 IF OLD.exited_at IS NOT NULL OR NEW.exited_at IS NULL OR (to_jsonb(NEW)-'exited_at') IS DISTINCT FROM (to_jsonb(OLD)-'exited_at') THEN RAISE EXCEPTION 'Visits permit only closing an open visit'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER crm_visits_close_only BEFORE UPDATE OR DELETE ON crm_stage_visits FOR EACH ROW EXECUTE FUNCTION crm_close_visit_only();
--> statement-breakpoint
CREATE TRIGGER crm_visits_no_truncate BEFORE TRUNCATE ON crm_stage_visits FOR EACH STATEMENT EXECUTE FUNCTION crm_close_visit_only();
--> statement-breakpoint
CREATE FUNCTION crm_validate_journey_stage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot jsonb; stage jsonb;
BEGIN
 SELECT definition INTO snapshot FROM crm_funnel_versions WHERE organization_id=NEW.organization_id AND id=NEW.version_id AND funnel_id=NEW.funnel_id;
 SELECT value INTO stage FROM jsonb_array_elements(snapshot->'stages') WHERE value->>'id'=NEW.current_stage;
 IF stage IS NULL THEN RAISE EXCEPTION 'Journey stage is not in its pinned version'; END IF;
 IF (stage->>'kind' IN ('entry','normal') AND NEW.state <> 'active') OR (stage->>'kind' IN ('successful','unsuccessful') AND NEW.state <> stage->>'kind') THEN RAISE EXCEPTION 'Journey outcome disagrees with stage kind'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['current_stage','state','revision','completed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['current_stage','state','revision','completed_at']) OR OLD.state <> 'active' OR NEW.revision <> OLD.revision+1 THEN RAISE EXCEPTION 'Journey anchors are immutable and revisions must advance once'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot->'transitions') e WHERE e->>'from'=OLD.current_stage AND e->>'to'=NEW.current_stage) THEN RAISE EXCEPTION 'Transition is not allowed by pinned version'; END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER crm_journey_stage_guard BEFORE INSERT OR UPDATE ON crm_funnel_instances FOR EACH ROW EXECUTE FUNCTION crm_validate_journey_stage();
--> statement-breakpoint
CREATE FUNCTION crm_validate_visit_stage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot jsonb;
BEGIN
 SELECT definition INTO snapshot FROM crm_funnel_versions WHERE organization_id=NEW.organization_id AND id=NEW.version_id;
 IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot->'stages') s WHERE s->>'id'=NEW.stage_id) THEN RAISE EXCEPTION 'Visit stage is not in pinned version'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER crm_visit_stage_guard BEFORE INSERT ON crm_stage_visits FOR EACH ROW EXECUTE FUNCTION crm_validate_visit_stage();
