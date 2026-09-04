import {
  IsEnum,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { EvaluationRecommendation } from '../../generated/prisma/client';

// REQ-EVAL-001/Q5: numeric per-competency scores + free text + an overall
// recommendation. Competency keys are org-defined free text (no fixed
// list exists anywhere in the schema), so scores is validated as a
// generic object here -- each value's 1-5 range is checked in the service
// (InterviewsService.submitEvaluation), same "complex validation belongs
// in the service" precedent as JobsService's salaryMin/salaryMax check.
export class SubmitEvaluationDto {
  @IsObject()
  @IsNotEmptyObject()
  scores!: Record<string, number>;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;

  @IsEnum(EvaluationRecommendation)
  recommendation!: EvaluationRecommendation;
}
