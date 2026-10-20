CREATE TYPE "public"."product_kind" AS ENUM('resale', 'internal');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_kind" AS ENUM('purchase', 'sale', 'sale_return', 'service_consumption', 'adjustment', 'loss', 'opening');--> statement-breakpoint
CREATE TYPE "public"."gift_card_status" AS ENUM('active', 'redeemed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."loyalty_point_kind" AS ENUM('earn', 'redeem', 'adjustment');--> statement-breakpoint
CREATE TABLE "service_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_materials_quantity_positive" CHECK ("service_materials"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"kind" "stock_movement_kind" NOT NULL,
	"quantity_delta" integer NOT NULL,
	"unit_cost_cents" bigint DEFAULT 0 NOT NULL,
	"supplier_id" uuid,
	"reference_type" text,
	"reference_id" uuid,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_quantity_non_zero" CHECK ("stock_movements"."quantity_delta" <> 0),
	CONSTRAINT "stock_movements_cost_non_negative" CHECK ("stock_movements"."unit_cost_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"segment" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"audience_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_card_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gift_card_id" uuid NOT NULL,
	"client_id" uuid,
	"charge_id" uuid,
	"amount_cents" bigint NOT NULL,
	"entry_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_card_redemptions_amount_positive" CHECK ("gift_card_redemptions"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "gift_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"initial_value_cents" bigint NOT NULL,
	"client_id" uuid,
	"status" "gift_card_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"entry_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_cards_value_positive" CHECK ("gift_cards"."initial_value_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "loyalty_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"points_delta" integer NOT NULL,
	"kind" "loyalty_point_kind" NOT NULL,
	"reference_type" text,
	"reference_id" uuid,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_points_delta_nonzero" CHECK ("loyalty_points"."points_delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "loyalty_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"points_per_real" integer DEFAULT 1 NOT NULL,
	"redeem_points_per_real" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_settings_points_non_negative" CHECK ("loyalty_settings"."points_per_real" >= 0),
	CONSTRAINT "loyalty_settings_redeem_positive" CHECK ("loyalty_settings"."redeem_points_per_real" > 0)
);
--> statement-breakpoint
ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_stock_non_negative";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "birthday" date;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "preferences" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "marketing_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "unit" text DEFAULT 'un' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "cost_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "min_stock" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "kind" "product_kind" DEFAULT 'resale' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_materials" ADD CONSTRAINT "service_materials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_materials" ADD CONSTRAINT "service_materials_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_materials" ADD CONSTRAINT "service_materials_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_redemptions" ADD CONSTRAINT "gift_card_redemptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_redemptions" ADD CONSTRAINT "gift_card_redemptions_gift_card_id_gift_cards_id_fk" FOREIGN KEY ("gift_card_id") REFERENCES "public"."gift_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_redemptions" ADD CONSTRAINT "gift_card_redemptions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_redemptions" ADD CONSTRAINT "gift_card_redemptions_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_redemptions" ADD CONSTRAINT "gift_card_redemptions_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_points" ADD CONSTRAINT "loyalty_points_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_points" ADD CONSTRAINT "loyalty_points_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_settings" ADD CONSTRAINT "loyalty_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_materials_tenant_idx" ON "service_materials" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "service_materials_service_idx" ON "service_materials" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_materials_service_variant_key" ON "service_materials" USING btree ("service_id","variant_id");--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_idx" ON "stock_movements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "stock_movements_variant_idx" ON "stock_movements" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_reference_key" ON "stock_movements" USING btree ("tenant_id","reference_type","reference_id","variant_id","kind") WHERE "stock_movements"."reference_id" is not null;--> statement-breakpoint
CREATE INDEX "suppliers_tenant_idx" ON "suppliers" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_tenant_name_key" ON "suppliers" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "campaigns_tenant_idx" ON "campaigns" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "gift_card_redemptions_tenant_idx" ON "gift_card_redemptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "gift_card_redemptions_card_idx" ON "gift_card_redemptions" USING btree ("gift_card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_cards_tenant_code_key" ON "gift_cards" USING btree ("tenant_id",lower("code"));--> statement-breakpoint
CREATE INDEX "gift_cards_tenant_idx" ON "gift_cards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "gift_cards_client_idx" ON "gift_cards" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "loyalty_points_tenant_idx" ON "loyalty_points" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "loyalty_points_client_idx" ON "loyalty_points" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_points_reference_key" ON "loyalty_points" USING btree ("tenant_id","reference_type","reference_id","kind") WHERE "loyalty_points"."reference_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_settings_tenant_key" ON "loyalty_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "clients_tags_idx" ON "clients" USING gin ("tags");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_cost_non_negative" CHECK ("product_variants"."cost_cents" >= 0);--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_min_stock_non_negative" CHECK ("product_variants"."min_stock" >= 0);