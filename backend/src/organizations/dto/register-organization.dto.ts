import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  organizationName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  ownerFullName!: string;

  @IsEmail()
  ownerEmail!: string;

  // Same policy as RegisterDto.password -- see docs/authentication.md §4.
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'ownerPassword must contain at least one letter and one number',
  })
  ownerPassword!: string;
}
