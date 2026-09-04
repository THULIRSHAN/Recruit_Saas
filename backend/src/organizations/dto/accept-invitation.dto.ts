import {
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';

// Only required for a brand-new user (checked in the service, not here --
// whether they're required depends on a DB lookup, which class-validator
// can't express declaratively).
export class AcceptInvitationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName?: string;

  // Same policy as RegisterDto.password -- see docs/authentication.md §4.
  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number',
  })
  password?: string;
}
