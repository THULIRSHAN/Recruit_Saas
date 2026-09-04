import { Module } from '@nestjs/common';
import { PipelineTemplatesModule } from '../pipeline-templates/pipeline-templates.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [PipelineTemplatesModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
