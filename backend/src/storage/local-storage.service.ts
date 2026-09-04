import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { SignedUrl, StorageService } from './storage.service';

// "Time-limited" per docs/security.md §11 -- 15 minutes is plenty for a
// candidate/recruiter to open a CV after requesting the link.
const DEFAULT_TTL_SECONDS = 15 * 60;
// Matches exactly what upload() generates (32 hex chars + short extension)
// -- StorageController validates an incoming :key against this before ever
// touching the filesystem with it (path-traversal defense-in-depth, since
// that endpoint is @Public()).
export const STORAGE_KEY_PATTERN = /^[a-f0-9]{32}(\.[a-zA-Z0-9]{1,10})?$/;

// docs/open-questions.md Q20: local-disk stand-in for Cloudinary/S3, with
// real (not faked) signed-URL semantics -- getSignedUrl() HMAC-signs
// key+expiry, and GET /api/v1/storage/:key (StorageController) verifies
// that signature before streaming the file. Never committed
// (backend/.gitignore) and not volume-mounted in docker-compose.yml --
// purely a dev/demo stub, files are ephemeral.
@Injectable()
export class LocalStorageService extends StorageService {
  private readonly baseDir = path.resolve(
    process.env.STORAGE_LOCAL_DIR ?? 'storage',
  );

  async upload(buffer: Buffer, fileName: string): Promise<{ key: string }> {
    await mkdir(this.baseDir, { recursive: true });
    // Extension kept only for a friendlier key/debugging; capped defensively
    // against a pathological client-supplied fileName.
    const ext = path.extname(fileName).slice(0, 10);
    const key = `${randomBytes(16).toString('hex')}${ext}`;
    await writeFile(this.filePath(key), buffer);
    return { key };
  }

  getSignedUrl(
    key: string,
    expiresInSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<SignedUrl> {
    const expires = Date.now() + expiresInSeconds * 1000;
    const signature = this.sign(key, expires);
    return Promise.resolve({
      // Relative path -- the frontend already knows its own API base URL
      // (NEXT_PUBLIC_API_URL); no canonical backend origin is configured
      // anywhere else in this project to prefix it with.
      url: `/api/v1/storage/${key}?expires=${expires}&signature=${signature}`,
      expiresAt: new Date(expires),
    });
  }

  async delete(key: string): Promise<void> {
    await rm(this.filePath(key), { force: true });
  }

  // Used only by StorageController, which is specific to this local-disk
  // implementation -- a real provider's signed URL points directly at the
  // provider and needs no local verification/proxy step at all.
  verify(key: string, expires: number, signature: string): boolean {
    if (!STORAGE_KEY_PATTERN.test(key)) {
      return false;
    }
    if (!Number.isFinite(expires) || Date.now() > expires) {
      return false;
    }
    const expected = Buffer.from(this.sign(key, expires));
    const actual = Buffer.from(signature);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  filePath(key: string): string {
    return path.join(this.baseDir, key);
  }

  private sign(key: string, expires: number): string {
    const secret = process.env.STORAGE_SIGNING_SECRET;
    if (!secret) {
      throw new Error('STORAGE_SIGNING_SECRET is not set -- see .env.example');
    }
    return createHmac('sha256', secret)
      .update(`${key}.${expires}`)
      .digest('hex');
  }
}
