import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { StorageModule } from '../storage/storage.module';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';

@Module({
  imports: [
    // In-memory buffer, not multer's default disk temp storage -- CV
    // magic-byte validation (docs/security.md §11) needs the raw bytes,
    // and StorageService.upload() takes a Buffer.
    MulterModule.register({ storage: memoryStorage() }),
    StorageModule,
  ],
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
