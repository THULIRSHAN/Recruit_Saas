export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

// docs/decisions/ADR-004: isolated behind a small internal interface so the
// backing provider (local disk for now -- see docs/open-questions.md Q20;
// Cloudinary/S3 later) is swappable without touching every module that
// uploads a file (Candidates' CVs, eventually Onboarding's documents).
export abstract class StorageService {
  abstract upload(buffer: Buffer, fileName: string): Promise<{ key: string }>;
  abstract getSignedUrl(
    key: string,
    expiresInSeconds?: number,
  ): Promise<SignedUrl>;
  abstract delete(key: string): Promise<void>;
}
