import {
  Body,
  Controller,
  Delete,
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
import { CreatePipelineTemplateDto } from './dto/create-pipeline-template.dto';
import { ListPipelineTemplatesQueryDto } from './dto/list-pipeline-templates-query.dto';
import { UpdatePipelineTemplateDto } from './dto/update-pipeline-template.dto';
import { PipelineTemplatesService } from './pipeline-templates.service';

// No dedicated pipeline:read permission is seeded (same gap as
// docs/open-questions.md Q14/Q15) -- reads are gated under pipeline:manage
// too, following that established precedent rather than inventing a new
// permission for a handful of read endpoints.
@Controller('pipeline-templates')
export class PipelineTemplatesController {
  constructor(
    private readonly pipelineTemplatesService: PipelineTemplatesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('pipeline:manage')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreatePipelineTemplateDto,
  ) {
    return this.pipelineTemplatesService.create(user.orgId, dto);
  }

  @Get()
  @RequirePermission('pipeline:manage')
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListPipelineTemplatesQueryDto,
  ) {
    return this.pipelineTemplatesService.list(user.orgId, query);
  }

  @Get(':id')
  @RequirePermission('pipeline:manage')
  @RequireTenant({ model: 'pipelineTemplate' })
  getOne(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.pipelineTemplatesService.getOne(user.orgId, id);
  }

  @Patch(':id')
  @RequirePermission('pipeline:manage')
  @RequireTenant({ model: 'pipelineTemplate' })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePipelineTemplateDto,
  ) {
    return this.pipelineTemplatesService.update(user.orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('pipeline:manage')
  @RequireTenant({ model: 'pipelineTemplate' })
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.pipelineTemplatesService.remove(user.orgId, id);
  }
}
