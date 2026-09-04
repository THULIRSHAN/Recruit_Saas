import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ListMyApplicationsQueryDto } from './dto/list-my-applications-query.dto';

// Candidate-facing side of REQ-APP-001 only (create/list-own/get-own/
// withdraw). Org-staff-facing screening/shortlisting (REQ-APP-002/003) is
// a separate ticket -- no :id here is ever resolved against an
// organization, only against the caller's own candidateId, so there is no
// tenant surface on this controller at all.
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('application:create')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationsService.create(user.sub, dto);
  }

  @Get('me')
  @RequirePermission('application:read')
  listMine(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListMyApplicationsQueryDto,
  ) {
    return this.applicationsService.listMine(user.sub, query);
  }

  @Get(':id')
  @RequirePermission('application:read')
  getMine(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.applicationsService.getMine(user.sub, id);
  }

  @Post(':id/withdraw')
  @RequirePermission('application:withdraw')
  withdraw(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.applicationsService.withdraw(user.sub, id);
  }
}
