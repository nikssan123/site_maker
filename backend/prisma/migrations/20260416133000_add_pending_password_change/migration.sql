-- CreateTable
CREATE TABLE "PendingPasswordChange" (
    "userId" TEXT NOT NULL,
    "newPasswordHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingPasswordChange_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "PendingPasswordChange_expiresAt_idx" ON "PendingPasswordChange"("expiresAt");

-- AddForeignKey
ALTER TABLE "PendingPasswordChange" ADD CONSTRAINT "PendingPasswordChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
