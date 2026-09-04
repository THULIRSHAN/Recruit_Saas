import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// REQ-APP-002 (Q22): PASS advances to the job's next pipeline stage by
// order; REJECT sets a terminal status instead of a stage. See
// ApplicationsService.screen().
export class ScreenApplicationDto {
  @IsIn(['PASS', 'REJECT'])
  decision!: 'PASS' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
