import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ListMyInterviewsQueryDto } from './dto/list-my-interviews-query.dto';
import { SubmitEvaluationDto } from './dto/submit-evaluation.dto';
import { InterviewsService } from './interviews.service';

// REQ-INT-003/REQ-EVAL-001: self-scoped, no @RequireTenant() -- same shape
// as ApplicationsController's /applications/me (ownership is by panel
// membership, not organizationId).
@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Get('me')
  @RequirePermission('interview:read')
  listMine(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListMyInterviewsQueryDto,
  ) {
    return this.interviewsService.listMine(user.sub, query);
  }

  @Post(':interviewId/evaluation')
  @RequirePermission('evaluation:submit')
  submitEvaluation(
    @CurrentUser() user: AccessTokenPayload,
    @Param('interviewId') interviewId: string,
    @Body() dto: SubmitEvaluationDto,
  ) {
    return this.interviewsService.submitEvaluation(user.sub, interviewId, dto);
  }
}
