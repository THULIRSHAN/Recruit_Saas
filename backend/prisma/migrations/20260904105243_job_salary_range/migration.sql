-- docs/open-questions.md Q17: REQ-JOB-001 calls for an optional salary
-- range on job creation, missing from the original Job model proposal.
ALTER TABLE "Job" ADD COLUMN "salaryMin" INTEGER;
ALTER TABLE "Job" ADD COLUMN "salaryMax" INTEGER;
