import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// REQ-AUTH-003 alt flow: rejection always carries a reason, sent to the
// Company Owner in the rejection email.
export class RejectOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
