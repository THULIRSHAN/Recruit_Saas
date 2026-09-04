import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsString,
} from 'class-validator';

// REQ-INT-001/002. mode is a plain string in the schema (see
// Interview.mode in schema.prisma), not a Prisma enum -- matching that
// existing choice rather than introducing one here.
export class ScheduleInterviewDto {
  @IsDateString()
  scheduledAt!: string;

  @IsIn(['ONSITE', 'VIDEO', 'PHONE'])
  mode!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  interviewerIds!: string[];
}
