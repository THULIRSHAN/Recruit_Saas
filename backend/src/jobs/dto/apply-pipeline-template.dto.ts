import { IsNotEmpty, IsString } from 'class-validator';

export class ApplyPipelineTemplateDto {
  @IsString()
  @IsNotEmpty()
  pipelineTemplateId!: string;
}
