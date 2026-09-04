import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// REQ-PIPE-001: an ordered list of stage names for this job specifically
// -- order is the array index. Same shape as CreatePipelineTemplateDto's
// stages, but this replaces a job's own snapshotted RecruitmentStage rows,
// not a reusable template.
export class ReplaceJobStagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  stages!: string[];
}
