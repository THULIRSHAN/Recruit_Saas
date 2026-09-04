import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class RescheduleInterviewDto {
  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsIn(['ONSITE', 'VIDEO', 'PHONE'])
  mode?: string;
}
