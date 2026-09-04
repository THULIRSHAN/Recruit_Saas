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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CandidatesService } from './candidates.service';
import { ReplaceEducationDto } from './dto/replace-education.dto';
import { ReplaceExperienceDto } from './dto/replace-experience.dto';
import { ReplaceSkillsDto } from './dto/replace-skills.dto';
import { UpdateCandidateProfileDto } from './dto/update-candidate-profile.dto';

// No :id anywhere on this controller -- every route acts on the caller's
// own profile via their token's sub, so there is no cross-candidate
// surface to guard against (same reasoning as organizations/me).
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  // No permission gate -- any authenticated user may view their own
  // (possibly not-yet-created) profile.
  @Get('me')
  getMine(@CurrentUser() user: AccessTokenPayload) {
    return this.candidatesService.getMine(user.sub);
  }

  @Patch('me')
  @RequirePermission('candidateProfile:update')
  updateMine(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateCandidateProfileDto,
  ) {
    return this.candidatesService.updateMine(user.sub, dto);
  }

  @Patch('me/education')
  @RequirePermission('candidateProfile:update')
  replaceEducation(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ReplaceEducationDto,
  ) {
    return this.candidatesService.replaceEducation(user.sub, dto);
  }

  @Patch('me/experience')
  @RequirePermission('candidateProfile:update')
  replaceExperience(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ReplaceExperienceDto,
  ) {
    return this.candidatesService.replaceExperience(user.sub, dto);
  }

  @Patch('me/skills')
  @RequirePermission('candidateProfile:update')
  replaceSkills(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ReplaceSkillsDto,
  ) {
    return this.candidatesService.replaceSkills(user.sub, dto);
  }

  @Post('me/cvs')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('candidateProfile:update')
  @UseInterceptors(FileInterceptor('file'))
  uploadCv(
    @CurrentUser() user: AccessTokenPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.candidatesService.uploadCv(user.sub, file);
  }

  @Patch('me/cvs/:id/primary')
  @RequirePermission('candidateProfile:update')
  setPrimaryCv(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.candidatesService.setPrimaryCv(user.sub, id);
  }

  @Delete('me/cvs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('candidateProfile:update')
  deleteCv(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.candidatesService.deleteCv(user.sub, id);
  }

  @Get('me/cvs/:id/signed-url')
  @RequirePermission('candidateProfile:update')
  getCvSignedUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.candidatesService.getCvSignedUrl(user.sub, id);
  }
}
