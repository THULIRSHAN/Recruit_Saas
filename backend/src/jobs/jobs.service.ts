import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Job, JobStatus } from '../generated/prisma/client';
import { PipelineTemplatesService } from '../pipeline-templates/pipeline-templates.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApplyPipelineTemplateDto } from './dto/apply-pipeline-template.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { ReplaceJobStagesDto } from './dto/replace-job-stages.dto';
import { UpdateJobDto } from './dto/update-job.dto';

const JOB_NOT_FOUND_MESSAGE = 'Job not found.';
// Unreachable in practice (PermissionsGuard already requires a non-empty,
// org-scoped role to reach any job:* handler, which implies a resolved
// orgId -- see AuthService.resolveDefaultOrgContext) -- defensive only.
const NO_ORG_CONTEXT_MESSAGE = 'No organization in session context.';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    // Reused for apply-template's ownership check (getOne 404s a
    // cross-tenant or nonexistent templateId) instead of JobsService
    // reaching into prisma.pipelineTemplate directly (CLAUDE.md rule 4).
    private readonly pipelineTemplatesService: PipelineTemplatesService,
  ) {}

  // REQ-JOB-001: DRAFT by default (see JobStatus.@default in schema).
  // organizationId/createdById come only from the authenticated context,
  // never client input -- docs/multi-tenancy.md §4's CORRECT pattern.
  async create(orgId: string | null, actorId: string, dto: CreateJobDto) {
    const organizationId = this.requireOrgId(orgId);
    this.validateSalaryRange(dto.salaryMin, dto.salaryMax);

    const job = await this.prisma.job.create({
      data: {
        organizationId,
        title: dto.title,
        description: dto.description,
        department: dto.department,
        location: dto.location,
        employmentType: dto.employmentType,
        salaryMin: dto.salaryMin,
        salaryMax: dto.salaryMax,
        createdById: actorId,
      },
    });
    return this.toDetail(job);
  }

  async list(orgId: string | null, query: ListJobsQueryDto) {
    const organizationId = this.requireOrgId(orgId);
    const where = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      data: data.map((job) => this.toDetail(job)),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // Defense-in-depth: TenantGuard (@RequireTenant({ model: 'job' })) on the
  // controller already 404s a cross-tenant :id before this runs, but the
  // organizationId filter here is the AUTHORITATIVE check
  // (docs/multi-tenancy.md §3) -- it must hold even if the guard were
  // removed or misconfigured.
  async getOne(orgId: string | null, id: string) {
    const organizationId = this.requireOrgId(orgId);
    const job = await this.requireJob(id, organizationId);
    return this.toDetail(job);
  }

  // REQ-JOB-001: "Edit: allowed in any state" -- no status check here.
  async update(orgId: string | null, id: string, dto: UpdateJobDto) {
    const organizationId = this.requireOrgId(orgId);
    this.validateSalaryRange(dto.salaryMin, dto.salaryMax);
    await this.requireJob(id, organizationId);

    const updated = await this.prisma.job.update({
      where: { id },
      data: dto,
    });
    return this.toDetail(updated);
  }

  // REQ-PIPE-001: RecruitmentStage is snapshotted per-job, not a live
  // reference to a template -- see the model comment in schema.prisma.
  async listStages(orgId: string | null, jobId: string) {
    const organizationId = this.requireOrgId(orgId);
    await this.requireJob(jobId, organizationId);

    const stages = await this.prisma.recruitmentStage.findMany({
      where: { jobId },
      orderBy: { order: 'asc' },
    });
    return stages.map((stage) => this.toStageDetail(stage));
  }

  // Replaces the job's stage list wholesale (delete + recreate) -- same
  // pattern as PipelineTemplatesService.update's stage replacement.
  async replaceStages(
    orgId: string | null,
    jobId: string,
    dto: ReplaceJobStagesDto,
  ) {
    const organizationId = this.requireOrgId(orgId);
    await this.requireJob(jobId, organizationId);
    return this.setStages(jobId, dto.stages);
  }

  // REQ-PIPE-001: "orgs can... apply [a pipeline template] to new jobs."
  // Copies the template's current stage names into new RecruitmentStage
  // rows -- a one-time snapshot, not a live link back to the template.
  async applyTemplate(
    orgId: string | null,
    jobId: string,
    dto: ApplyPipelineTemplateDto,
  ) {
    const organizationId = this.requireOrgId(orgId);
    await this.requireJob(jobId, organizationId);

    // getOne 404s if the template doesn't exist or belongs to another org
    // -- reusing PipelineTemplatesService's own tenant check rather than
    // duplicating it here.
    const template = await this.pipelineTemplatesService.getOne(
      orgId,
      dto.pipelineTemplateId,
    );
    const stageNames = [...template.stages]
      .sort((a, b) => a.order - b.order)
      .map((stage) => stage.name);

    return this.setStages(jobId, stageNames);
  }

  // REQ-JOB-001: DRAFT -> PUBLISHED only, and only once a recruitment
  // stage exists (CLAUDE.md's business-rules quick reference: "Job
  // publishing requires at least one recruitment pipeline stage to
  // exist"). Published jobs appear in public search (REQ-JOB-005, a
  // separate ticket).
  async publish(orgId: string | null, id: string) {
    const organizationId = this.requireOrgId(orgId);
    const job = await this.requireJob(id, organizationId);

    if (job.status !== JobStatus.DRAFT) {
      throw new ConflictException(
        `Job is already ${job.status.toLowerCase()}.`,
      );
    }
    const stageCount = await this.prisma.recruitmentStage.count({
      where: { jobId: id },
    });
    if (stageCount === 0) {
      throw new ConflictException(
        'Job must have at least one recruitment stage before it can be published.',
      );
    }

    const updated = await this.prisma.job.update({
      where: { id },
      data: { status: JobStatus.PUBLISHED, publishedAt: new Date() },
    });
    return this.toDetail(updated);
  }

  // REQ-JOB-001: PUBLISHED -> CLOSED only. "Closed jobs stop accepting
  // applications but remain visible for record-keeping; removed from
  // public search results" (the latter enforced by REQ-JOB-005's own
  // PUBLISHED-only filter, a separate ticket).
  async close(orgId: string | null, id: string) {
    const organizationId = this.requireOrgId(orgId);
    const job = await this.requireJob(id, organizationId);

    if (job.status !== JobStatus.PUBLISHED) {
      throw new ConflictException(
        `Job is not published (current status: ${job.status}).`,
      );
    }

    const updated = await this.prisma.job.update({
      where: { id },
      data: { status: JobStatus.CLOSED, closedAt: new Date() },
    });
    return this.toDetail(updated);
  }

  // REQ-JOB-001: ARCHIVED is "a terminal soft-delete state" -- reachable
  // from any non-ARCHIVED status, matching docs/api.md §1's DELETE
  // convention ("jobs... never hard-deleted; archived... instead").
  // Gated by job:update at the controller (no dedicated job:archive
  // permission is seeded -- same established gap as docs/open-questions.md
  // Q14/Q17: reuse the closest existing permission rather than invent one
  // for a single action).
  async archive(orgId: string | null, id: string) {
    const organizationId = this.requireOrgId(orgId);
    const job = await this.requireJob(id, organizationId);

    if (job.status === JobStatus.ARCHIVED) {
      throw new ConflictException('Job is already archived.');
    }

    await this.prisma.job.update({
      where: { id },
      data: { status: JobStatus.ARCHIVED },
    });
  }

  private async setStages(jobId: string, stageNames: string[]) {
    const stages = await this.prisma.$transaction(async (tx) => {
      await tx.recruitmentStage.deleteMany({ where: { jobId } });
      await tx.recruitmentStage.createMany({
        data: stageNames.map((name, index) => ({ jobId, name, order: index })),
      });
      return tx.recruitmentStage.findMany({
        where: { jobId },
        orderBy: { order: 'asc' },
      });
    });
    return stages.map((stage) => this.toStageDetail(stage));
  }

  private async requireJob(id: string, organizationId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id, organizationId },
    });
    if (!job) {
      throw new NotFoundException(JOB_NOT_FOUND_MESSAGE);
    }
    return job;
  }

  private requireOrgId(orgId: string | null): string {
    if (!orgId) {
      throw new NotFoundException(NO_ORG_CONTEXT_MESSAGE);
    }
    return orgId;
  }

  // Only checked when both are present in the same call -- a partial
  // update touching just one of the two fields doesn't re-validate against
  // the other's already-stored value. Not a stated business rule, just an
  // MVP-scope simplification.
  private validateSalaryRange(min?: number, max?: number) {
    if (min !== undefined && max !== undefined && min > max) {
      throw new BadRequestException(
        'salaryMin must not be greater than salaryMax.',
      );
    }
  }

  private toDetail(job: Job) {
    return {
      id: job.id,
      organizationId: job.organizationId,
      title: job.title,
      description: job.description,
      department: job.department,
      location: job.location,
      employmentType: job.employmentType,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      status: job.status,
      createdById: job.createdById,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      publishedAt: job.publishedAt,
      closedAt: job.closedAt,
    };
  }

  private toStageDetail(stage: { id: string; name: string; order: number }) {
    return { id: stage.id, name: stage.name, order: stage.order };
  }
}
