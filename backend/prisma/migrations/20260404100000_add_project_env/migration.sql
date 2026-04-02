-- Add build-time public env vars (e.g. VITE_STRIPE_PUBLISHABLE_KEY) and
-- encrypted runtime secrets (e.g. STRIPE_SECRET_KEY) to Project.
ALTER TABLE "Project" ADD COLUMN "buildEnv" JSONB;
ALTER TABLE "Project" ADD COLUMN "runtimeEnv" TEXT;
