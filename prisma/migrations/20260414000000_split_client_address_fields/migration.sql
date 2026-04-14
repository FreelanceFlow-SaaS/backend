-- Split Client.address into addressLine1, zipCode, city, country
-- The old single-string address field is replaced by four structured fields.

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "address",
ADD COLUMN "address_line1" TEXT NOT NULL DEFAULT '',
ADD COLUMN "zip_code"      TEXT NOT NULL DEFAULT '',
ADD COLUMN "city"          TEXT NOT NULL DEFAULT '',
ADD COLUMN "country"       TEXT NOT NULL DEFAULT 'FR';

-- Remove the temporary defaults after backfill — columns remain NOT NULL
ALTER TABLE "clients"
  ALTER COLUMN "address_line1" DROP DEFAULT,
  ALTER COLUMN "zip_code"      DROP DEFAULT,
  ALTER COLUMN "city"          DROP DEFAULT;
