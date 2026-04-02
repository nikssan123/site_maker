-- CreateTable
CREATE TABLE "AnalyticsPageView" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '/',
    "device" TEXT NOT NULL DEFAULT 'desktop',
    "referrer" TEXT,
    "visitorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsPageView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsPageView_projectId_createdAt_idx" ON "AnalyticsPageView"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "AnalyticsPageView" ADD CONSTRAINT "AnalyticsPageView_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
