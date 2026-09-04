import { Module } from '@nestjs/common';
import { PipelineTemplatesModule } from '../pipeline-templates/pipeline-templates.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PublicJobsController } from './public-jobs.controller';

@Module({
  imports: [PipelineTemplatesModule],
  // PublicJobsController MUST be registered before JobsController: Nest
  // registers Express routes in controller-array order, and
  // PublicJobsController's literal GET /jobs/search would otherwise be
  // shadowed by JobsController's GET /jobs/:id (same 2-segment shape --
  // Express would match "search" as the :id and hit the authenticated
  // handler first, 401ing instead of reaching the public one).
  // GET /jobs/public/:id has no such collision (3 segments), but keeping
  // this controller first for both routes avoids relying on that.
  controllers: [PublicJobsController, JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
