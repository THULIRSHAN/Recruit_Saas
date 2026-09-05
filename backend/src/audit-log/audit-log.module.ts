import { Module } from '@nestjs/common';
import { AdminAuditLogController } from './admin-audit-log.controller';
import { AuditLogService } from './audit-log.service';

@Module({
  controllers: [AdminAuditLogController],
  providers: [AuditLogService],
})
export class AuditLogModule {}
