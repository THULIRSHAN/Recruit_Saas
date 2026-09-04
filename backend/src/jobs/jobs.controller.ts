import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RequireTenant } from '../auth/decorators/require-tenant.decorator';
import { ApplyPipelineTemplateDto } from './dto/apply-pipeline-template.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { ReplaceJobStagesDto } from './dto/replace-job-stages.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('job:create')
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateJobDto) {
    return this.jobsService.create(user.orgId, user.sub, dto);
  }

  @Get()
  @RequirePermission('job:read')
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListJobsQueryDto,
  ) {
    return this.jobsService.list(user.orgId, query);
  }

  // TenantGuard is defense-in-depth (docs/multi-tenancy.md §3) -- the
  // service's own organizationId filter is the authoritative check.
  @Get(':id')
  @RequirePermission('job:read')
  @RequireTenant({ model: 'job' })
  getOne(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.jobsService.getOne(user.orgId, id);
  }

  @Patch(':id')
  @RequirePermission('job:update')
  @RequireTenant({ model: 'job' })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
  ) {
    return this.jobsService.update(user.orgId, id, dto);
  }

  @Get(':id/stages')
  @RequirePermission('job:read')
  @RequireTenant({ model: 'job' })
  listStages(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.jobsService.listStages(user.orgId, id);
  }

  // docs/api.md §1: PUT is unused project-wide (PATCH covers our needs) --
  // PATCH here even though this replaces the stage list wholesale.
  @Patch(':id/stages')
  @RequirePermission('pipeline:manage')
  @RequireTenant({ model: 'job' })
  replaceStages(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: ReplaceJobStagesDto,
  ) {
    return this.jobsService.replaceStages(user.orgId, id, dto);
  }

  @Post(':id/stages/apply-template')
  @RequirePermission('pipeline:manage')
  @RequireTenant({ model: 'job' })
  applyTemplate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: ApplyPipelineTemplateDto,
  ) {
    return this.jobsService.applyTemplate(user.orgId, id, dto);
  }
}
