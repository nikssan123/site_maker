-- Password reset tokens (hashed). Idempotent so fresh + existing DBs both apply cleanly.

CREATE TABLE IF NOT EXISTS "PasswordReset" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordReset_tokenHash_key"
    ON "PasswordReset"("tokenHash");

CREATE INDEX IF NOT EXISTS "PasswordReset_userId_createdAt_idx"
    ON "PasswordReset"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "PasswordReset_expiresAt_idx"
    ON "PasswordReset"("expiresAt");
