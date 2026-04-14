-- Add logo storage fields to freelancer_profiles.
-- logo_storage_key: relative path within the uploads directory (e.g. "logos/uuid.png").
-- logo_updated_at:  timestamp of last logo upload, for cache-busting.
ALTER TABLE "freelancer_profiles"
  ADD COLUMN "logo_storage_key" TEXT,
  ADD COLUMN "logo_updated_at"  TIMESTAMPTZ;
