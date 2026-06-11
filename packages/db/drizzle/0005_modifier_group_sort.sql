ALTER TABLE "modifier_groups" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
