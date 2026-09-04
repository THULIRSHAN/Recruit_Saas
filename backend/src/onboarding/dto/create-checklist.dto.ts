import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// REQ-DOC-001: each task represents a requested document (e.g. "Submit ID
// proof"). required defaults to true -- see OnboardingTask.required in
// schema.prisma.
export class CreateChecklistTaskDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class CreateChecklistDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateChecklistTaskDto)
  tasks!: CreateChecklistTaskDto[];
}
