import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { OnboardingService } from './onboarding.service';

// REQ-DOC-002: candidate-owned, no @RequireTenant() -- ownership is by
// candidateId (via OffersService.getMine() -> ApplicationsService.getMine()),
// same shape as ApplicationOfferController.
@Controller('applications/:id/onboarding')
export class ApplicationOnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  @RequirePermission('onboarding:read')
  getMine(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') applicationId: string,
  ) {
    return this.onboardingService.getMine(user.sub, applicationId);
  }

  @Post('tasks/:taskId/documents')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('document:upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') applicationId: string,
    @Param('taskId') taskId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.onboardingService.uploadDocument(
      user.sub,
      applicationId,
      taskId,
      file,
    );
  }
}
