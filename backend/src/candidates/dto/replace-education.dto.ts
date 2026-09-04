import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class EducationItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  institution!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  degree?: string;

  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(2100)
  startYear?: number;

  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(2100)
  endYear?: number;
}

// Replaces the candidate's whole education list wholesale (delete +
// recreate) -- same pattern as PipelineTemplatesService/JobsService's
// stage-list replacement.
export class ReplaceEducationDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EducationItemDto)
  education!: EducationItemDto[];
}
