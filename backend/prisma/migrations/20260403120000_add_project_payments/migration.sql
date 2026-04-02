-- AlterTable
ALTER TABLE "Project"
  ADD COLUMN "stripeAccountId" TEXT,
  ADD COLUMN "paymentsEnabled" BOOLEAN NOT NULL DEFAULT false;
