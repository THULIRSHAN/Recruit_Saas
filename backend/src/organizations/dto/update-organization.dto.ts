import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// The only editable field on Organization per M5.3's scope.
export class UpdateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
