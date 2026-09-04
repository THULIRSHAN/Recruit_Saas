import { Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  controllers: [StorageController],
  providers: [
    LocalStorageService,
    // Other modules depend on the abstract StorageService -- swapping
    // providers later (docs/open-questions.md Q20) is a one-line change
    // here, not a change to every consumer.
    { provide: StorageService, useExisting: LocalStorageService },
  ],
  exports: [StorageService],
})
export class StorageModule {}
