-- Iteration improvement subscription (€20/mo) + token accounting.
-- Adds User.iterationSub* fields, TokenUsageLog, TokenGrant.
-- Backfills existing Project.paidIterationCredits into TokenGrant (1 credit = 30_000 tokens), then zeros them.

-- 1. User columns
ALTER TABLE "User" ADD COLUMN "iterationSubStripeId"           TEXT;
ALTER TABLE "User" ADD COLUMN "iterationSubStatus"             TEXT;
ALTER TABLE "User" ADD COLUMN "iterationSubCancelAtPeriodEnd"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "iterationSubCurrentPeriodStart" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "iterationSubCurrentPeriodEnd"   TIMESTAMP(3);

CREATE UNIQUE INDEX "User_iterationSubStripeId_key" ON "User"("iterationSubStripeId");

-- 2. TokenUsageLog
CREATE TABLE "TokenUsageLog" (
    "id"           TEXT        NOT NULL,
    "userId"       TEXT        NOT NULL,
    "projectId"    TEXT,
    "provider"     TEXT        NOT NULL,
    "model"        TEXT        NOT NULL,
    "endpoint"     TEXT        NOT NULL,
    "inputTokens"  INTEGER     NOT NULL,
    "outputTokens" INTEGER     NOT NULL,
    "costMicros"   INTEGER     NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenUsageLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TokenUsageLog"
  ADD CONSTRAINT "TokenUsageLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "TokenUsageLog_userId_createdAt_idx" ON "TokenUsageLog"("userId", "createdAt");
CREATE INDEX "TokenUsageLog_createdAt_idx"        ON "TokenUsageLog"("createdAt");

-- 3. TokenGrant
CREATE TABLE "TokenGrant" (
    "id"              TEXT        NOT NULL,
    "userId"          TEXT        NOT NULL,
    "tokens"          INTEGER     NOT NULL,
    "reason"          TEXT        NOT NULL,
    "grantedBy"       TEXT,
    "stripeSessionId" TEXT,
    "note"            TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"       TIMESTAMP(3),
    CONSTRAINT "TokenGrant_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TokenGrant"
  ADD CONSTRAINT "TokenGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TokenGrant_stripeSessionId_key" ON "TokenGrant"("stripeSessionId");
CREATE INDEX "TokenGrant_userId_expiresAt_idx"       ON "TokenGrant"("userId", "expiresAt");
CREATE INDEX "TokenGrant_userId_createdAt_idx"       ON "TokenGrant"("userId", "createdAt");

-- 4. Backfill: convert existing paidIterationCredits into migration TokenGrants (30k tokens each).
-- One grant per user, aggregating all their projects' unused credits.
INSERT INTO "TokenGrant" ("id", "userId", "tokens", "reason", "note", "createdAt")
SELECT
    gen_random_uuid()::text,
    s."userId",
    SUM(p."paidIterationCredits") * 30000,
    'migration',
    'Converted from paidIterationCredits (' || SUM(p."paidIterationCredits") || ' credits × 30k tokens)',
    CURRENT_TIMESTAMP
FROM "Project" p
JOIN "Session" s ON s."id" = p."sessionId"
WHERE p."paidIterationCredits" > 0
GROUP BY s."userId";

-- Zero out the old per-project credit column. Column itself is kept so in-flight webhooks / the
-- Project.includesSitePurchaseBundle bonus path don't break; it's simply unused by the new quota system.
UPDATE "Project" SET "paidIterationCredits" = 0 WHERE "paidIterationCredits" > 0;
