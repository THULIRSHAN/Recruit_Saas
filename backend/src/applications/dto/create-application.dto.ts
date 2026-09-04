import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// REQ-APP-001: cvId is optional -- when omitted, the candidate's primary
// CV is used (422 if they have none). coverNote is optional.
export class CreateApplicationDto {
  @IsString()
  @IsNotEmpty()
  jobId!: string;

  @IsOptional()
  @IsString()
  cvId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  coverNote?: string;
}
