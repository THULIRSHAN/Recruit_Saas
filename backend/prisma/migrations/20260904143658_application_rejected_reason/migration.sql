-- docs/open-questions.md Q22: optional reason recorded when a Recruiter
-- rejects an application at screening (REQ-APP-002).
ALTER TABLE "Application" ADD COLUMN "rejectedReason" TEXT;
