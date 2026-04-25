-- Tag iteration token usage that came from a free-tier iteration so it doesn't
-- count against the user's subscription quota or the daily $ circuit breaker.
ALTER TABLE "TokenUsageLog" ADD COLUMN "isFree" BOOLEAN NOT NULL DEFAULT false;
