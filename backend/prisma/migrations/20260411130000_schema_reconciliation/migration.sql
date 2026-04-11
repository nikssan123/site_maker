-- Reconciliation migration: brings the database in line with schema.prisma.
-- Fully idempotent — safe on fresh and partially-drifted databases alike.

-- =============================================================================
-- User table: drop legacy columns, add isAdmin + freeProjectUsed
-- =============================================================================
DROP INDEX IF EXISTS "User_stripeSubscriptionId_key";

ALTER TABLE "User" DROP COLUMN IF EXISTS "tier";
ALTER TABLE "User" DROP COLUMN IF EXISTS "stripeSubscriptionId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "subscriptionStatus";

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "freeProjectUsed" BOOLEAN NOT NULL DEFAULT false;

-- =============================================================================
-- UsageLog table: removed from schema.prisma, drop if it still exists
-- =============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UsageLog_userId_fkey') THEN
        ALTER TABLE "UsageLog" DROP CONSTRAINT "UsageLog_userId_fkey";
    END IF;
END $$;

DROP TABLE IF EXISTS "UsageLog";

-- =============================================================================
-- Session table: add missing columns
-- =============================================================================
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "generationPurchased" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "sitePurchaseExtrasPending" BOOLEAN NOT NULL DEFAULT false;

-- =============================================================================
-- Project table: add missing columns + unique index
-- =============================================================================
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "paid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "hosted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "hostingSubscriptionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Project_hostingSubscriptionId_key"
    ON "Project"("hostingSubscriptionId");

-- =============================================================================
-- PlanExecution table: create if missing
-- =============================================================================
CREATE TABLE IF NOT EXISTS "PlanExecution" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "planId" TEXT,
    "planData" JSONB NOT NULL,
    "projectPaid" BOOLEAN NOT NULL DEFAULT false,
    "isRetry" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlanExecution_sessionId_createdAt_idx"
    ON "PlanExecution"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "PlanExecution_planId_createdAt_idx"
    ON "PlanExecution"("planId", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanExecution_sessionId_fkey') THEN
        ALTER TABLE "PlanExecution"
            ADD CONSTRAINT "PlanExecution_sessionId_fkey"
            FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanExecution_planId_fkey') THEN
        ALTER TABLE "PlanExecution"
            ADD CONSTRAINT "PlanExecution_planId_fkey"
            FOREIGN KEY ("planId") REFERENCES "Plan"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
