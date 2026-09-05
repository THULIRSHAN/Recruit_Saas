import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateUniversityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
