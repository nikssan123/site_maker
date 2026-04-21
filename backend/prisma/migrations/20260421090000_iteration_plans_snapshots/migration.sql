CREATE TABLE "IterationPlan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changeRequest" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "planBulletsBg" JSONB NOT NULL,
    "spec" TEXT NOT NULL,
    "targetFiles" JSONB NOT NULL,
    "nonGoals" JSONB,
    "explorerContextNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "snapshotBeforeId" TEXT,
    "iterationLogId" TEXT,
    "errorLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "IterationPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "files" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "runPort" INTEGER,
    "buildLog" TEXT,
    "errorLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IterationPlan_projectId_createdAt_idx" ON "IterationPlan"("projectId", "createdAt");
CREATE INDEX "IterationPlan_userId_createdAt_idx" ON "IterationPlan"("userId", "createdAt");
CREATE INDEX "IterationPlan_status_createdAt_idx" ON "IterationPlan"("status", "createdAt");
CREATE INDEX "ProjectSnapshot_projectId_createdAt_idx" ON "ProjectSnapshot"("projectId", "createdAt");

ALTER TABLE "IterationPlan" ADD CONSTRAINT "IterationPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectSnapshot" ADD CONSTRAINT "ProjectSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
