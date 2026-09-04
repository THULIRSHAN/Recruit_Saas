import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTalentPoolDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
