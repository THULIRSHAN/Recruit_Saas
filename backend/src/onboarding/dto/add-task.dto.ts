import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddTaskDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}
