-- Add paid_at column to invoices.
-- Nullable: only set when an invoice transitions to status = 'paid'.
-- Used as the authoritative payment date for revenue calculations.
ALTER TABLE "invoices" ADD COLUMN "paid_at" TIMESTAMPTZ;
