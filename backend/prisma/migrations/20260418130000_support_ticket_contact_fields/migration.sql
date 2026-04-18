-- AlterTable
ALTER TABLE "SupportTicket"
  ADD COLUMN "contactEmail" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "contactPhone" TEXT NOT NULL DEFAULT '';

-- Drop defaults after backfill so new rows must supply values from the app.
ALTER TABLE "SupportTicket"
  ALTER COLUMN "contactEmail" DROP DEFAULT,
  ALTER COLUMN "contactPhone" DROP DEFAULT;
