-- CreateEnum
CREATE TYPE "barcode_kind" AS ENUM ('gtin', 'other');

-- CreateEnum
CREATE TYPE "stock_movement_type" AS ENUM ('create', 'edit', 'adjust', 'receive', 'issue', 'count');

-- CreateEnum
CREATE TYPE "stock_movement_source" AS ENUM ('manual', 'camera', 'scanner');

-- CreateTable
CREATE TABLE "product_barcodes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "code" VARCHAR(200) NOT NULL,
    "raw_code" VARCHAR(200) NOT NULL,
    "kind" "barcode_kind" NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID,
    "product_sku" VARCHAR(64) NOT NULL,
    "product_name" VARCHAR(200) NOT NULL,
    "type" "stock_movement_type" NOT NULL,
    "source" "stock_movement_source" NOT NULL,
    "quantity_before" INTEGER NOT NULL,
    "quantity_change" INTEGER NOT NULL,
    "quantity_after" INTEGER NOT NULL,
    "note" VARCHAR(200),
    "user_id" UUID,
    "idempotency_key" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_barcodes_product_id_idx" ON "product_barcodes"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_barcodes_organization_id_code_key" ON "product_barcodes"("organization_id", "code");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_product_id_created_at_idx" ON "stock_movements"("organization_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_created_at_idx" ON "stock_movements"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_organization_id_idempotency_key_key" ON "stock_movements"("organization_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Constraints Prisma's schema language cannot express.

-- A barcode may only point at a product of its own organization.
CREATE UNIQUE INDEX "products_id_organization_id_key" ON "products" ("id", "organization_id");
ALTER TABLE "product_barcodes"
  ADD CONSTRAINT "product_barcodes_product_same_organization_fkey"
  FOREIGN KEY ("product_id", "organization_id") REFERENCES "products" ("id", "organization_id") ON DELETE CASCADE,
  ADD CONSTRAINT "product_barcodes_code_not_blank" CHECK (length(btrim("code")) > 0);

-- Ledger rows must be arithmetically consistent and never describe negative stock.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_arithmetic" CHECK ("quantity_before" + "quantity_change" = "quantity_after"),
  ADD CONSTRAINT "stock_movements_nonnegative" CHECK ("quantity_before" >= 0 AND "quantity_after" >= 0);
