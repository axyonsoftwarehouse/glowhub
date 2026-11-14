CREATE TABLE "client_otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_otp_codes" ADD CONSTRAINT "client_otp_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_sessions" ADD CONSTRAINT "client_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_otp_codes_tenant_email_idx" ON "client_otp_codes" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "client_otp_codes_expires_idx" ON "client_otp_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "client_sessions_token_hash_key" ON "client_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "client_sessions_tenant_email_idx" ON "client_sessions" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "client_sessions_expires_idx" ON "client_sessions" USING btree ("expires_at");