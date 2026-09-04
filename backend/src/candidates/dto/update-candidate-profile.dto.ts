import { IsOptional, IsString, MaxLength } from 'class-validator';

// REQ-CAND-001: headline, location, contact (phone). All optional --
// partial update, and also doubles as the create payload (the profile is
// upserted lazily on first write, not via a separate POST).
export class UpdateCandidateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;
}
