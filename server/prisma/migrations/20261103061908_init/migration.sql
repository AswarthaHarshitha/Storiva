-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "default_low_stock_threshold" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "description" VARCHAR(2000),
    "quantity_on_hand" INTEGER NOT NULL DEFAULT 0,
    "cost_price" DECIMAL(12,2),
    "selling_price" DECIMAL(12,2),
    "low_stock_threshold" INTEGER,
    "last_adjustment_note" VARCHAR(200),
    "last_updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "products_organization_id_name_idx" ON "products"("organization_id", "name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_last_updated_by_id_fkey" FOREIGN KEY ("last_updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Constraints Prisma's schema language cannot express.

-- SKU is unique per organization, ignoring case ("ab-1" and "AB-1" are the same SKU).
CREATE UNIQUE INDEX "products_organization_id_sku_key" ON "products" ("organization_id", lower("sku"));

ALTER TABLE "products"
  ADD CONSTRAINT "products_quantity_on_hand_nonnegative" CHECK ("quantity_on_hand" >= 0),
  ADD CONSTRAINT "products_low_stock_threshold_nonnegative" CHECK ("low_stock_threshold" IS NULL OR "low_stock_threshold" >= 0),
  ADD CONSTRAINT "products_cost_price_nonnegative" CHECK ("cost_price" IS NULL OR "cost_price" >= 0),
  ADD CONSTRAINT "products_selling_price_nonnegative" CHECK ("selling_price" IS NULL OR "selling_price" >= 0),
  ADD CONSTRAINT "products_name_not_blank" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "products_sku_not_blank" CHECK (length(btrim("sku")) > 0);

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_default_low_stock_threshold_nonnegative" CHECK ("default_low_stock_threshold" >= 0),
  ADD CONSTRAINT "organizations_name_not_blank" CHECK (length(btrim("name")) > 0);

-- Emails are stored lower-cased by the application; the constraint keeps that true.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));
