CREATE TABLE "platform_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"provider_subscription_id" text,
	"plan" text,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"paid_at" timestamp with time zone,
	"period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_subscriptions" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"plan" text,
	"status" text NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"provider" text,
	"provider_subscription_id" text,
	"pending_plan" text,
	"pending_provider_subscription_id" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_payments" ADD CONSTRAINT "platform_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_payments_provider_key" ON "platform_payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "platform_payments_tenant_idx" ON "platform_payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscriptions_provider_sub_key" ON "platform_subscriptions" USING btree ("provider_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscriptions_pending_sub_key" ON "platform_subscriptions" USING btree ("pending_provider_subscription_id");