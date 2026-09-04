import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PublicJobSearchQueryDto } from './dto/public-job-search-query.dto';
import { JobsService } from './jobs.service';

// Separate from JobsController: that controller's routes are uniformly
// authenticated/org-scoped, while these two are the one deliberately
// cross-tenant, public endpoint class in the whole system (REQ-JOB-005,
// docs/multi-tenancy.md §6). Distinct literal path segments ('search',
// 'public/:id') rather than reusing JobsController's '' / ':id' so there's
// no route-ordering ambiguity between the authenticated and public
// variants.
@Controller('jobs')
export class PublicJobsController {
  constructor(private readonly jobsService: JobsService) {}

  // No @Throttle override -- app.module.ts's generous global default was
  // written anticipating exactly this endpoint.
  @Public()
  @Get('search')
  search(@Query() query: PublicJobSearchQueryDto) {
    return this.jobsService.search(query);
  }

  @Public()
  @Get('public/:id')
  getOne(@Param('id') id: string) {
    return this.jobsService.getPublicOne(id);
  }
}
