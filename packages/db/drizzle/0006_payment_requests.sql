CREATE TABLE IF NOT EXISTS "payment_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "provider" varchar(30) DEFAULT 'sepay' NOT NULL,
  "payment_code" varchar(50) NOT NULL,
  "amount" integer NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "qr_payload" text,
  "qr_url" text,
  "paid_amount" integer DEFAULT 0 NOT NULL,
  "provider_transaction_id" varchar(255),
  "provider_payload" jsonb,
  "expires_at" timestamp with time zone NOT NULL,
  "paid_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" varchar(30) DEFAULT 'sepay' NOT NULL,
  "provider_transaction_id" varchar(255),
  "payment_request_id" uuid,
  "branch_id" uuid,
  "amount" integer DEFAULT 0 NOT NULL,
  "content" text,
  "matched" boolean DEFAULT false NOT NULL,
  "reason" varchar(100),
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_request_id_payment_requests_id_fk" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_requests_code" ON "payment_requests" USING btree ("payment_code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_requests_provider_tx" ON "payment_requests" USING btree ("provider","provider_transaction_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_requests_order" ON "payment_requests" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_requests_branch_status" ON "payment_requests" USING btree ("branch_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_webhook_provider_tx" ON "payment_webhook_events" USING btree ("provider","provider_transaction_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_webhook_request" ON "payment_webhook_events" USING btree ("payment_request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_webhook_branch" ON "payment_webhook_events" USING btree ("branch_id");
