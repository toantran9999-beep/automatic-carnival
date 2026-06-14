CREATE TABLE IF NOT EXISTS "register_shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "opened_by" uuid NOT NULL,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "opening_cash" integer DEFAULT 0 NOT NULL,
  "closed_by" uuid,
  "closed_at" timestamp with time zone,
  "closing_cash" integer,
  "expected_cash" integer,
  "cash_difference" integer,
  "cash_sales" integer,
  "total_sales" integer,
  "order_count" integer,
  "sales_by_method" jsonb,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_register_shifts_open_per_branch" ON "register_shifts" USING btree ("branch_id") WHERE "status" = 'open';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_register_shifts_branch_status" ON "register_shifts" USING btree ("branch_id","status");
