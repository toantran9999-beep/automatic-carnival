ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "unit" varchar(20);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "unit" varchar(20);
