ALTER TABLE "order_item_modifiers" DROP CONSTRAINT IF EXISTS "order_item_modifiers_modifier_id_modifiers_id_fk";
--> statement-breakpoint
ALTER TABLE "order_item_modifiers" ALTER COLUMN "modifier_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_modifier_id_modifiers_id_fk" FOREIGN KEY ("modifier_id") REFERENCES "public"."modifiers"("id") ON DELETE set null ON UPDATE no action;
