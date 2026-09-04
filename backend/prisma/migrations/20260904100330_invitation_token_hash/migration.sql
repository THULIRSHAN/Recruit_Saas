-- docs/open-questions.md Q16: store a hash, not the raw token, matching
-- the convention already used by RefreshToken.tokenHash and
-- VerificationToken.tokenHash.
ALTER TABLE "Invitation" RENAME COLUMN "token" TO "tokenHash";
ALTER INDEX "Invitation_token_key" RENAME TO "Invitation_tokenHash_key";
