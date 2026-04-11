-- CreateTable (idempotent — table may have been created out-of-band on some environments)
CREATE TABLE IF NOT EXISTS "IterationLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IterationLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'IterationLog_projectId_fkey'
    ) THEN
        ALTER TABLE "IterationLog"
            ADD CONSTRAINT "IterationLog_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddColumn (idempotent)
ALTER TABLE "IterationLog" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "IterationLog" ADD COLUMN IF NOT EXISTS "description" TEXT;
