import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

// REQ-AUTH-008: one role per invitation -- see docs/open-questions.md Q16.
export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  roleKey!: string;
}
