import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Job,
  JobStatus,
  OrganizationStatus,
  Prisma,
} from '../generated/prisma/client';
import { PipelineTemplatesService } from '../pipeline-templates/pipeline-templates.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApplyPipelineTemplateDto } from './dto/apply-pipeline-template.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { PublicJobSearchQueryDto } from './dto/public-job-search-query.dto';
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

  // REQ-JOB-005: the one deliberately cross-tenant endpoint class in the
  // whole system (docs/multi-tenancy.md §6) -- public, unauthenticated,
  // spans every organization, but only ever returns PUBLISHED jobs
  // belonging to ACTIVE orgs, enforced in the query itself (not just the
  // UI), per that same section and CLAUDE.md's business-rules summary.
  async search(query: PublicJobSearchQueryDto) {
    const where: Prisma.JobWhereInput = {
      status: JobStatus.PUBLISHED,
      organization: { status: OrganizationStatus.ACTIVE },
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword, mode: 'insensitive' } },
              {
                description: { contains: query.keyword, mode: 'insensitive' },
              },
            ],
          }
        : {}),
      ...(query.location
        ? { location: { contains: query.location, mode: 'insensitive' } }
        : {}),
      ...(query.employmentType ? { employmentType: query.employmentType } : {}),
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { organization: { select: { id: true, name: true } } },
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      data: data.map((job) => this.toPublicDetail(job)),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // REQ-JOB-005's implied "job details" view (docs/api.md §1's frontend
  // route list: "(public)/ -> ... public job search, job details"). Same
  // PUBLISHED + ACTIVE-org filter as search() -- a DRAFT/CLOSED/ARCHIVED
  // job, or one at a non-ACTIVE org, must not be confirmed to exist here
  // any more than it would be in search results.
  async getPublicOne(id: string) {
    const job = await this.prisma.job.findFirst({
      where: {
        id,
        status: JobStatus.PUBLISHED,
        organization: { status: OrganizationStatus.ACTIVE },
      },
      include: { organization: { select: { id: true, name: true } } },
    });
    if (!job) {
      throw new NotFoundException(JOB_NOT_FOUND_MESSAGE);
    }
    return this.toPublicDetail(job);
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

  // Replaces the job's stage list wholesale -- see setStages() for how
  // (diffed against the existing rows, not a blind delete + recreate;
  // PipelineTemplatesService.update()'s own stage replacement can still get
  // away with delete + recreate since nothing references a template stage
  // by id the way Application.stageId references a RecruitmentStage).
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

    // docs/api.md §2's own worked example for this exact field: "422
    // (referenced pipelineTemplateId belongs to a different org)". This is
    // a foreign id referenced as an *input* to an action on the caller's
    // own resource, not a direct fetch of the foreign resource by its own
    // URL :id -- so multi-tenancy.md §5's "cross-tenant access -> 404"
    // rule (which is about the latter) doesn't apply here. Still collapses
    // "doesn't exist" and "belongs to another org" into one response so
    // neither is distinguishable to the caller.
    let template;
    try {
      template = await this.pipelineTemplatesService.getOne(
        orgId,
        dto.pipelineTemplateId,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new UnprocessableEntityException(
          'pipelineTemplateId does not refer to a pipeline template in your organization.',
        );
      }
      throw error;
    }
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
      // 422, not 409 -- docs/api.md §1's own literal example: "422
      // semantically invalid (e.g., publishing a job with no pipeline
      // stages)". Distinct from the "already published" case just above,
      // which is a genuine resource-state conflict (409).
      throw new UnprocessableEntityException(
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

  // Bug found via manual testing (2026-09-05): the previous delete-all-then-
  // recreate approach 500'd (unhandled P2003) the moment a job had even one
  // Application, since Application.stageId has no onDelete action and
  // Postgres rejects deleting a still-referenced RecruitmentStage row. Fixed
  // by diffing against the existing stages instead: match by name to reuse
  // (and just reorder) a stage a candidate may already be sitting in --
  // preserving Application.stageId/ApplicationStageHistory references
  // untouched -- create genuinely new names, and only delete names being
  // dropped, which is now validated as safe first. No spec doc covers
  // "can stages be edited after candidates have applied" at all -- see
  // docs/open-questions.md Q35 for why blocking the delete rather than
  // guessing a remap for the *removed* name is the right call.
  private async setStages(jobId: string, stageNames: string[]) {
    const stages = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.recruitmentStage.findMany({
        where: { jobId },
      });
      const existingByName = new Map(existing.map((s) => [s.name, s]));
      const keepNames = new Set(stageNames);
      const toRemove = existing.filter((s) => !keepNames.has(s.name));

      if (toRemove.length > 0) {
        const stillInUse = await tx.application.findFirst({
          where: { jobId, stageId: { in: toRemove.map((s) => s.id) } },
          select: { stage: { select: { name: true } } },
        });
        if (stillInUse) {
          throw new ConflictException(
            `Cannot remove stage "${stillInUse.stage.name}" -- a candidate is currently in it. Move them to another stage first.`,
          );
        }
        await tx.recruitmentStage.deleteMany({
          where: { id: { in: toRemove.map((s) => s.id) } },
        });
      }

      await Promise.all(
        stageNames.map((name, index) => {
          const match = existingByName.get(name);
          return match
            ? tx.recruitmentStage.update({
                where: { id: match.id },
                data: { order: index },
              })
            : tx.recruitmentStage.create({
                data: { jobId, name, order: index },
              });
        }),
      );

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

  // Deliberately narrower than toDetail() -- no createdById/status/
  // updatedAt/closedAt/organizationId. Public candidate-facing response,
  // not the staff-facing one.
  private toPublicDetail(
    job: Job & { organization: { id: string; name: string } },
  ) {
    return {
      id: job.id,
      title: job.title,
      description: job.description,
      department: job.department,
      location: job.location,
      employmentType: job.employmentType,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      publishedAt: job.publishedAt,
      organization: {
        id: job.organization.id,
        name: job.organization.name,
      },
    };
  }
}
