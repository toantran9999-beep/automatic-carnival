CREATE TABLE "table_session_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(40) NOT NULL,
	"source_session_id" uuid,
	"target_session_id" uuid,
	"source_table_id" uuid,
	"target_table_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "table_session_events" ADD CONSTRAINT "table_session_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "table_session_events" ADD CONSTRAINT "table_session_events_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "table_session_events" ADD CONSTRAINT "table_session_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "table_session_events" ADD CONSTRAINT "table_session_events_source_session_id_table_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "table_session_events" ADD CONSTRAINT "table_session_events_target_session_id_table_sessions_id_fk" FOREIGN KEY ("target_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "table_session_events" ADD CONSTRAINT "table_session_events_source_table_id_tables_id_fk" FOREIGN KEY ("source_table_id") REFERENCES "public"."tables"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "table_session_events" ADD CONSTRAINT "table_session_events_target_table_id_tables_id_fk" FOREIGN KEY ("target_table_id") REFERENCES "public"."tables"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_table_session_events_branch_created" ON "table_session_events" USING btree ("branch_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_table_session_events_source" ON "table_session_events" USING btree ("source_session_id");
--> statement-breakpoint
CREATE INDEX "idx_table_session_events_target" ON "table_session_events" USING btree ("target_session_id");
