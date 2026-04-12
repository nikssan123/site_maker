DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'IterationLog_projectId_fkey'
    ) THEN
        ALTER TABLE "IterationLog" DROP CONSTRAINT "IterationLog_projectId_fkey";
    END IF;
END $$;

ALTER TABLE "IterationLog"
    ADD CONSTRAINT "IterationLog_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
