import { existsSync } from 'node:fs';
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import {
  LocalStorageService,
  STORAGE_KEY_PATTERN,
} from './local-storage.service';

// Specific to LocalStorageService (docs/open-questions.md Q20) -- a real
// provider's signed URL points directly at the provider (e.g. Cloudinary),
// needing no local proxy at all, so this controller (and its route) is
// dead code once one is wired in.
@Controller('storage')
export class StorageController {
  constructor(private readonly localStorage: LocalStorageService) {}

  // Public: the security here comes entirely from possessing a valid,
  // time-limited signature (docs/security.md §11), not from a session --
  // matching how a real provider's signed URL also needs no auth header.
  @Public()
  @Get(':key')
  download(
    @Param('key') key: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res() res: Response,
  ) {
    // Same 404 regardless of which check fails -- don't confirm whether a
    // key exists to a caller with an invalid/expired/missing signature.
    if (
      !STORAGE_KEY_PATTERN.test(key) ||
      !expires ||
      !signature ||
      !this.localStorage.verify(key, Number(expires), signature)
    ) {
      throw new NotFoundException();
    }

    const filePath = this.localStorage.filePath(key);
    if (!existsSync(filePath)) {
      throw new NotFoundException();
    }
    res.sendFile(filePath);
  }
}
