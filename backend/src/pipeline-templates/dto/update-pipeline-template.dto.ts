import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// If `stages` is provided, it replaces the template's stage list
// wholesale (delete + recreate) -- same "replace the set wholesale"
// pattern as prisma/seed.ts's RolePermission reconciliation, simpler than
// diffing an ordered list against itself.
export class UpdatePipelineTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  stages?: string[];
}
