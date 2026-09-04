import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ExperienceItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  company!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

// Replaces the candidate's whole experience list wholesale (delete +
// recreate) -- same pattern as ReplaceEducationDto.
export class ReplaceExperienceDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ExperienceItemDto)
  experience!: ExperienceItemDto[];
}
