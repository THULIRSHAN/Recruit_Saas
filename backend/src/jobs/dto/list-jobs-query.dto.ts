import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { JobStatus } from '../../generated/prisma/client';

// docs/api.md §1: `?page=1&pageSize=20`, capped server-side. Org's own
// staff-facing list -- includes every status, unlike public search
// (REQ-JOB-005, a separate ticket) which only ever returns PUBLISHED.
export class ListJobsQueryDto {
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
