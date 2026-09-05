import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogQueryDto } from './dto/list-audit-log-query.dto';

// Q33: the admin portal's frontend had nowhere to read AuditLog from --
// write-only since M5. Super Admin only, platform-level (not tenant-scoped,
// same reasoning as AdminAnalyticsController). auditLog:read was already
// seeded onto SUPER_ADMIN back in M4 but never used by any controller --
// no new permission needed here, unlike Q30/Q31/Q32's genuinely-missing keys.
@Controller('admin/audit-log')
export class AdminAuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequirePermission('auditLog:read')
  list(@Query() query: ListAuditLogQueryDto) {
    return this.auditLogService.list(query);
  }
}
