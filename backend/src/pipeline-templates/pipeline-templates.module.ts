import { Module } from '@nestjs/common';
import { PipelineTemplatesController } from './pipeline-templates.controller';
import { PipelineTemplatesService } from './pipeline-templates.service';

@Module({
  controllers: [PipelineTemplatesController],
  providers: [PipelineTemplatesService],
  exports: [PipelineTemplatesService],
})
export class PipelineTemplatesModule {}
