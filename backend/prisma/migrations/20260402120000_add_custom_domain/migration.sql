-- AlterTable
ALTER TABLE "Project" ADD COLUMN "customDomain" TEXT,
ADD COLUMN "customDomainVerifiedAt" TIMESTAMP(3),
ADD COLUMN "domainVerificationToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_customDomain_key" ON "Project"("customDomain");
