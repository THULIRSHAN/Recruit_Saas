# ADR-004: File Storage Provider — Cloudinary (MVP) over AWS S3

Status: Proposed — needs team confirmation (see `open-questions.md` Q8)
Date: 2026-09-03

## Context

The tech stack lists "AWS S3 or Cloudinary" as an either/or choice for CV and document storage. Both meet the private-storage + signed-URL requirement in `security.md` §11.

## Decision (recommended, pending confirmation)

Use **Cloudinary** for MVP.

## Reasoning

- **Setup friction:** Cloudinary's free tier and SDK require less AWS-account/IAM configuration than S3 (no IAM policies, bucket policies, or CORS config to get right under time pressure) — meaningfully lowers the chance a student developer misconfigures a bucket as public (a real, common, embarrassing mistake).
- **Signed URLs:** both support them natively; Cloudinary's are arguably simpler to generate correctly for a team new to this.
- **Cost:** both have workable free tiers for a student project's expected volume.
- **When S3 would be the better call:** if the team wants deeper AWS experience for learning purposes (a legitimate goal for a "professional practices" course), or if file volume/size needs outgrow Cloudinary's free tier. This is a reasonable trade-off for the team to weigh — hence "recommended, pending confirmation" rather than final.

## Consequences

- The storage integration is isolated behind a small internal interface (`StorageService.upload()`, `.getSignedUrl()`, `.delete()`) specifically so this choice is swappable later without touching every module that uploads a file (Candidates' CVs, Onboarding's Documents) — this abstraction is worth building regardless of which provider is chosen first.
