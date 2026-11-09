CREATE TYPE "public"."webhook_event_status" AS ENUM('pending', 'processed', 'failed');--> statement-breakpoint
ALTER TYPE "public"."stock_movement_kind" ADD VALUE 'service_return' BEFORE 'adjustment';--> statement-breakpoint
ALTER TYPE "public"."earning_status" ADD VALUE 'void';--> statement-breakpoint
DROP INDEX "charges_appointment_key";--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "status" "webhook_event_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "request_url" text;--> statement-breakpoint
CREATE INDEX "webhook_events_retry_idx" ON "webhook_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_appointment_key" ON "charges" USING btree ("appointment_id") WHERE "charges"."appointment_id" is not null and "charges"."status" in ('open', 'paid');