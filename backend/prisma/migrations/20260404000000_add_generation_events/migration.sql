-- CreateTable
CREATE TABLE "GenerationEvent" (
    "id"        SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "payload"   JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationEvent_sessionId_id_idx" ON "GenerationEvent"("sessionId", "id");

-- AddForeignKey
ALTER TABLE "GenerationEvent"
    ADD CONSTRAINT "GenerationEvent_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
