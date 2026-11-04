-- Additive only. (Prisma's generated diff also proposed dropping the hand-written tenant
-- constraint products_id_organization_id_key / product_barcodes_product_same_organization_fkey,
-- which it does not know about; those statements were removed on purpose.)

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "brand" VARCHAR(120),
ADD COLUMN     "catalogue_provider" VARCHAR(40),
ADD COLUMN     "catalogue_retrieved_at" TIMESTAMPTZ(3),
ADD COLUMN     "catalogue_source_name" VARCHAR(60),
ADD COLUMN     "category" VARCHAR(200),
ADD COLUMN     "image_url" VARCHAR(500),
ADD COLUMN     "manufacturer" VARCHAR(200);

-- CreateTable
CREATE TABLE "catalogue_entries" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "code" VARCHAR(14) NOT NULL,
    "found" BOOLEAN NOT NULL,
    "data" JSONB,
    "source_name" VARCHAR(60),
    "source_url" VARCHAR(500),
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalogue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalogue_entries_provider_code_key" ON "catalogue_entries"("provider", "code");

