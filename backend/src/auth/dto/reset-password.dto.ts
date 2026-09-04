import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  // Same policy as RegisterDto.password -- see docs/authentication.md §4.
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'newPassword must contain at least one letter and one number',
  })
  newPassword!: string;
}
