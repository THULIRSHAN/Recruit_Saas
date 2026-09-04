import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Job } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { UpdateJobDto } from './dto/update-job.dto';

const JOB_NOT_FOUND_MESSAGE = 'Job not found.';
// Unreachable in practice (PermissionsGuard already requires a non-empty,
// org-scoped role to reach any job:* handler, which implies a resolved
// orgId -- see AuthService.resolveDefaultOrgContext) -- defensive only.
const NO_ORG_CONTEXT_MESSAGE = 'No organization in session context.';

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const job = await this.prisma.job.findFirst({
      where: { id, organizationId },
    });
    if (!job) {
      throw new NotFoundException(JOB_NOT_FOUND_MESSAGE);
    }
    return this.toDetail(job);
  }

  // REQ-JOB-001: "Edit: allowed in any state" -- no status check here.
  async update(orgId: string | null, id: string, dto: UpdateJobDto) {
    const organizationId = this.requireOrgId(orgId);
    this.validateSalaryRange(dto.salaryMin, dto.salaryMax);

    const job = await this.prisma.job.findFirst({
      where: { id, organizationId },
    });
    if (!job) {
      throw new NotFoundException(JOB_NOT_FOUND_MESSAGE);
    }

    const updated = await this.prisma.job.update({
      where: { id },
      data: dto,
    });
    return this.toDetail(updated);
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
}
