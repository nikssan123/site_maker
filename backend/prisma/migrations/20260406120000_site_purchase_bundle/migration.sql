-- AlterTable
ALTER TABLE "Session" ADD COLUMN "sitePurchaseExtrasPending" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "hostingFreeUntil" TIMESTAMP(3),
ADD COLUMN "includesSitePurchaseBundle" BOOLEAN NOT NULL DEFAULT false;
