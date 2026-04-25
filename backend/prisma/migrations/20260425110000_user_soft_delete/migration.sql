-- Soft delete: keep the User row when the account is deleted so the email
-- cannot be reused and support can restore the account on request.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
