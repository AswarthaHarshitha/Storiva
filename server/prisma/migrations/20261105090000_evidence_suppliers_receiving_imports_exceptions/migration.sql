-- Additive only. Prisma's generated diff also proposed dropping the hand-written tenant
-- constraint on product_barcodes (and its supporting index); those statements were removed.

-- CreateEnum
CREATE TYPE "evidence_status" AS ENUM ('verified', 'documented', 'entered', 'unverified');

-- CreateEnum
CREATE TYPE "receipt_status" AS ENUM ('draft', 'confirmed');

-- CreateEnum
CREATE TYPE "exception_status" AS ENUM ('open', 'resolved', 'dismissed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "stock_movement_source" ADD VALUE 'import';
ALTER TYPE "stock_movement_source" ADD VALUE 'receiving';
ALTER TYPE "stock_movement_source" ADD VALUE 'copilot';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "reference_id" UUID,
ADD COLUMN     "reference_type" VARCHAR(20);

-- CreateTable
CREATE TABLE "product_evidence" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "field" VARCHAR(30) NOT NULL,
    "value" VARCHAR(500),
    "source" VARCHAR(30) NOT NULL,
    "status" "evidence_status" NOT NULL,
    "detail" VARCHAR(200),
    "reference_type" VARCHAR(20),
    "reference_id" UUID,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(40),
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "supplier_id" UUID,
    "reference" VARCHAR(80),
    "document_date" DATE,
    "expected_date" DATE,
    "status" "receipt_status" NOT NULL DEFAULT 'draft',
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "document_text" TEXT,
    "total_amount" DECIMAL(12,2),
    "notes" VARCHAR(1000),
    "created_by_id" UUID,
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_lines" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID,
    "position" INTEGER NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "expected_quantity" INTEGER,
    "received_quantity" INTEGER NOT NULL,
    "damaged_quantity" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(12,2),
    "update_cost" BOOLEAN NOT NULL DEFAULT false,
    "match_confidence" VARCHAR(10),

    CONSTRAINT "receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "created_count" INTEGER NOT NULL,
    "updated_count" INTEGER NOT NULL,
    "adjusted_count" INTEGER NOT NULL,
    "skipped_count" INTEGER NOT NULL,
    "errors" JSONB NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_exceptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "dedupe_key" VARCHAR(200) NOT NULL,
    "product_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "detail" JSONB NOT NULL,
    "status" "exception_status" NOT NULL DEFAULT 'open',
    "resolution_note" VARCHAR(500),
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_evidence_organization_id_product_id_field_created_a_idx" ON "product_evidence"("organization_id", "product_id", "field", "created_at");

-- CreateIndex
CREATE INDEX "suppliers_organization_id_idx" ON "suppliers"("organization_id");

-- CreateIndex
CREATE INDEX "receipts_organization_id_created_at_idx" ON "receipts"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "receipts_supplier_id_idx" ON "receipts"("supplier_id");

-- CreateIndex
CREATE INDEX "receipt_lines_receipt_id_idx" ON "receipt_lines"("receipt_id");

-- CreateIndex
CREATE INDEX "receipt_lines_organization_id_product_id_idx" ON "receipt_lines"("organization_id", "product_id");

-- CreateIndex
CREATE INDEX "import_batches_organization_id_created_at_idx" ON "import_batches"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_exceptions_organization_id_status_idx" ON "inventory_exceptions"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_exceptions_organization_id_dedupe_key_key" ON "inventory_exceptions"("organization_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "product_evidence" ADD CONSTRAINT "product_evidence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_evidence" ADD CONSTRAINT "product_evidence_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_evidence" ADD CONSTRAINT "product_evidence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_exceptions" ADD CONSTRAINT "inventory_exceptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_exceptions" ADD CONSTRAINT "inventory_exceptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Constraints Prisma's schema language cannot express.

-- Evidence and exceptions may only point at a product of their own organization.
ALTER TABLE "product_evidence"
  ADD CONSTRAINT "product_evidence_product_same_organization_fkey"
  FOREIGN KEY ("product_id", "organization_id") REFERENCES "products" ("id", "organization_id") ON DELETE CASCADE;
ALTER TABLE "inventory_exceptions"
  ADD CONSTRAINT "inventory_exceptions_product_same_organization_fkey"
  FOREIGN KEY ("product_id", "organization_id") REFERENCES "products" ("id", "organization_id") ON DELETE CASCADE;

-- Receipt lines belong to a receipt of the same organization.
CREATE UNIQUE INDEX "receipts_id_organization_id_key" ON "receipts" ("id", "organization_id");
ALTER TABLE "receipt_lines"
  ADD CONSTRAINT "receipt_lines_receipt_same_organization_fkey"
  FOREIGN KEY ("receipt_id", "organization_id") REFERENCES "receipts" ("id", "organization_id") ON DELETE CASCADE,
  ADD CONSTRAINT "receipt_lines_quantities_valid" CHECK (
    "received_quantity" >= 0 AND "damaged_quantity" >= 0 AND "damaged_quantity" <= "received_quantity"
    AND ("expected_quantity" IS NULL OR "expected_quantity" >= 0)
    AND ("unit_cost" IS NULL OR "unit_cost" >= 0)
  );

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_total_nonnegative" CHECK ("total_amount" IS NULL OR "total_amount" >= 0);

-- Supplier names are unique per organization, ignoring case.
CREATE UNIQUE INDEX "suppliers_organization_id_name_key" ON "suppliers" ("organization_id", lower("name"));
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_name_not_blank" CHECK (length(btrim("name")) > 0);
