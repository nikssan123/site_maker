-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailDomain" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "resendDomainId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "dnsRecords" JSONB,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDomain_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailSettings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "fromName" TEXT,
    "fromEmail" TEXT NOT NULL,
    "domainId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailTemplate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "resendMessageId" TEXT,
    "to" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EmailDomain_resendDomainId_key" ON "EmailDomain"("resendDomainId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailDomain_projectId_domain_key" ON "EmailDomain"("projectId", "domain");
CREATE INDEX IF NOT EXISTS "EmailDomain_projectId_verified_idx" ON "EmailDomain"("projectId", "verified");

CREATE UNIQUE INDEX IF NOT EXISTS "EmailSettings_projectId_key" ON "EmailSettings"("projectId");
CREATE INDEX IF NOT EXISTS "EmailSettings_projectId_idx" ON "EmailSettings"("projectId");
CREATE INDEX IF NOT EXISTS "EmailSettings_domainId_idx" ON "EmailSettings"("domainId");

CREATE UNIQUE INDEX IF NOT EXISTS "EmailTemplate_projectId_eventType_key" ON "EmailTemplate"("projectId", "eventType");
CREATE INDEX IF NOT EXISTS "EmailTemplate_projectId_eventType_idx" ON "EmailTemplate"("projectId", "eventType");

CREATE INDEX IF NOT EXISTS "EmailLog_projectId_createdAt_idx" ON "EmailLog"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_resendMessageId_idx" ON "EmailLog"("resendMessageId");

-- AddForeignKey (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailDomain_projectId_fkey') THEN
        ALTER TABLE "EmailDomain" ADD CONSTRAINT "EmailDomain_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailSettings_projectId_fkey') THEN
        ALTER TABLE "EmailSettings" ADD CONSTRAINT "EmailSettings_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailSettings_domainId_fkey') THEN
        ALTER TABLE "EmailSettings" ADD CONSTRAINT "EmailSettings_domainId_fkey"
            FOREIGN KEY ("domainId") REFERENCES "EmailDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailTemplate_projectId_fkey') THEN
        ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailLog_projectId_fkey') THEN
        ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
