import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// REQ-HIRE-001/Q6: Hiring Manager is the sole finalizer.
export class DecideApplicationDto {
  @IsIn(['HIRE', 'REJECT'])
  decision!: 'HIRE' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
