import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApplicationStatus,
  JobStatus,
  OrganizationStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { DecideApplicationDto } from './dto/decide-application.dto';
import { ListJobApplicationsQueryDto } from './dto/list-job-applications-query.dto';
import { ListMyApplicationsQueryDto } from './dto/list-my-applications-query.dto';
import { ScreenApplicationDto } from './dto/screen-application.dto';

const APPLICATION_NOT_FOUND_MESSAGE = 'Application not found.';
// Same precedent as JobsService -- PermissionsGuard already blocks a
// candidate-only login from reaching org-scoped endpoints, this is
// defense-in-depth only.
const NO_ORG_CONTEXT_MESSAGE = 'No organization in session context.';
// Matches getPublicOne's exact precedent (M6.5) -- a DRAFT/CLOSED/ARCHIVED
// job, or one at a non-ACTIVE org, must not be distinguishable from a
// nonexistent one to a candidate. (Non-ACTIVE-org-but-PUBLISHED-job is
// unreachable today -- nothing transitions ACTIVE -> SUSPENDED yet -- kept
// as defense-in-depth for when it is.)
const JOB_NOT_APPLICABLE_MESSAGE =
  'Job not found or is not currently accepting applications.';

const applicationInclude = {
  job: {
    select: {
      id: true,
      title: true,
      organization: { select: { id: true, name: true } },
    },
  },
  cv: { select: { id: true, fileName: true } },
  stage: { select: { id: true, name: true } },
} satisfies Prisma.ApplicationInclude;

type ApplicationWithRelations = Prisma.ApplicationGetPayload<{
  include: typeof applicationInclude;
}>;

// Org-staff view (M7.4): candidate identity instead of job/org identity,
// since the caller already knows the job from the URL. See requireJobApplication.
const orgApplicationInclude = {
  candidate: { select: { id: true, fullName: true, email: true } },
  cv: { select: { id: true, fileName: true } },
  stage: { select: { id: true, name: true, order: true } },
} satisfies Prisma.ApplicationInclude;

type ApplicationWithOrgRelations = Prisma.ApplicationGetPayload<{
  include: typeof orgApplicationInclude;
}>;

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  // REQ-APP-001. "At most one ACTIVE application per job+candidate" is
  // enforced by a Postgres partial unique index (see the comment on
  // Application in schema.prisma) -- caught here as P2002, not
  // pre-checked, to avoid a race between the check and the insert.
  async create(candidateId: string, dto: CreateApplicationDto) {
    const job = await this.prisma.job.findUnique({
      where: { id: dto.jobId },
      include: { organization: { select: { status: true } } },
    });
    if (
      !job ||
      job.status !== JobStatus.PUBLISHED ||
      job.organization.status !== OrganizationStatus.ACTIVE
    ) {
      throw new NotFoundException(JOB_NOT_APPLICABLE_MESSAGE);
    }

    const cvId = await this.resolveCvId(candidateId, dto.cvId);

    // A PUBLISHED job is guaranteed to have at least one stage -- that's
    // the precondition JobsService.publish() enforces (M6.4) -- so this is
    // a lookup, not a business-rule check.
    const firstStage = await this.prisma.recruitmentStage.findFirstOrThrow({
      where: { jobId: job.id },
      orderBy: { order: 'asc' },
    });

    try {
      const application = await this.prisma.application.create({
        data: {
          jobId: job.id,
          candidateId,
          organizationId: job.organizationId,
          cvId,
          stageId: firstStage.id,
          coverNote: dto.coverNote,
        },
        include: applicationInclude,
      });
      return this.toDetail(application);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'You already have an active application for this job.',
        );
      }
      throw error;
    }
  }

  async listMine(candidateId: string, query: ListMyApplicationsQueryDto) {
    const where = {
      candidateId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        orderBy: { appliedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: applicationInclude,
      }),
      this.prisma.application.count({ where }),
    ]);

    return {
      data: data.map((application) => this.toDetail(application)),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getMine(candidateId: string, id: string) {
    const application = await this.requireOwnApplication(candidateId, id);
    return this.toDetail(application);
  }

  // REQ-APP-001: withdrawing frees the candidate to re-apply later -- the
  // partial unique index only blocks a second ACTIVE row, not a WITHDRAWN
  // one.
  async withdraw(candidateId: string, id: string) {
    const application = await this.requireOwnApplication(candidateId, id);
    if (application.status !== ApplicationStatus.ACTIVE) {
      throw new ConflictException(
        `Application is already ${application.status.toLowerCase()}.`,
      );
    }

    const updated = await this.prisma.application.update({
      where: { id: application.id },
      data: { status: ApplicationStatus.WITHDRAWN },
      include: applicationInclude,
    });
    return this.toDetail(updated);
  }

  // REQ-APP-002/003 (Q22): org-staff review, scoped to one job. organizationId
  // comes from the authenticated context (CurrentUser), never the URL --
  // CLAUDE.md rule 2 -- TenantGuard's jobId check is defense-in-depth only.
  async listForJob(
    orgId: string | null,
    jobId: string,
    query: ListJobApplicationsQueryDto,
  ) {
    const organizationId = this.requireOrgId(orgId);
    const where = {
      jobId,
      organizationId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        orderBy: { appliedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: orgApplicationInclude,
      }),
      this.prisma.application.count({ where }),
    ]);

    return {
      data: data.map((application) => this.toOrgDetail(application)),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getForJob(orgId: string | null, jobId: string, id: string) {
    const organizationId = this.requireOrgId(orgId);
    const application = await this.requireJobApplication(
      organizationId,
      jobId,
      id,
    );
    return this.toOrgDetail(application);
  }

  // REQ-APP-002: PASS advances to the job's next stage by order (Q22 --
  // there's no canonical "Shortlisted" stage name to target, stages are
  // fully recruiter-defined per job); REJECT sets a terminal status instead
  // of a stage, same reasoning M7.3 already applied to WITHDRAWN.
  async screen(
    orgId: string | null,
    actorId: string,
    jobId: string,
    id: string,
    dto: ScreenApplicationDto,
  ) {
    const organizationId = this.requireOrgId(orgId);
    const application = await this.requireJobApplication(
      organizationId,
      jobId,
      id,
    );
    if (application.status !== ApplicationStatus.ACTIVE) {
      throw new ConflictException(
        `Application is already ${application.status.toLowerCase()}.`,
      );
    }

    if (dto.decision === 'REJECT') {
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.application.update({
          where: { id: application.id },
          data: {
            status: ApplicationStatus.REJECTED,
            rejectedReason: dto.reason,
          },
          include: orgApplicationInclude,
        });
        await tx.auditLog.create({
          data: {
            actorId,
            organizationId,
            action: 'application.rejected',
            targetType: 'Application',
            targetId: application.id,
            metadata: { reason: dto.reason ?? null, source: 'screening' },
          },
        });
        return this.toOrgDetail(updated);
      });
    }

    const nextStage = await this.prisma.recruitmentStage.findFirst({
      where: { jobId, order: application.stage.order + 1 },
    });
    if (!nextStage) {
      throw new UnprocessableEntityException(
        'No further pipeline stage exists to move this application into.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.application.update({
        where: { id: application.id },
        data: { stageId: nextStage.id },
        include: orgApplicationInclude,
      });
      await tx.applicationStageHistory.create({
        data: {
          applicationId: application.id,
          fromStageId: application.stage.id,
          toStageId: nextStage.id,
          movedById: actorId,
        },
      });
      return this.toOrgDetail(updated);
    });
  }

  // REQ-HIRE-001/Q6: Hiring Manager's final decision. Unlike screen()'s
  // PASS, there's no "move to next stage" outcome here -- HIRE and REJECT
  // both set a terminal status, mirroring withdraw()/screen()'s reasoning
  // that a status transition, not a pipeline position, is what "final"
  // means for an Application. No @@unique or partial-index race to guard
  // against here (unlike M7.3's create()), since the ACTIVE precondition
  // below is the only path into this state change.
  async decide(
    orgId: string | null,
    actorId: string,
    jobId: string,
    id: string,
    dto: DecideApplicationDto,
  ) {
    const organizationId = this.requireOrgId(orgId);
    const application = await this.requireJobApplication(
      organizationId,
      jobId,
      id,
    );
    if (application.status !== ApplicationStatus.ACTIVE) {
      throw new ConflictException(
        `Application is already ${application.status.toLowerCase()}.`,
      );
    }

    const isHire = dto.decision === 'HIRE';
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.application.update({
        where: { id: application.id },
        data: isHire
          ? { status: ApplicationStatus.HIRED }
          : {
              status: ApplicationStatus.REJECTED,
              rejectedReason: dto.reason,
            },
        include: orgApplicationInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          organizationId,
          action: isHire ? 'application.hired' : 'application.rejected',
          targetType: 'Application',
          targetId: application.id,
          metadata: isHire
            ? {}
            : { reason: dto.reason ?? null, source: 'decision' },
        },
      });
      return this.toOrgDetail(updated);
    });
  }

  // dto.cvId is the "reference in the caller's own request body" case,
  // same family as Q18's pipelineTemplateId -- 422 when it doesn't belong
  // to them, not the direct-URL-access 404 (multi-tenancy.md §5's rule
  // doesn't apply, and there's no cross-candidate existence to protect
  // either -- they already know which CVs are theirs).
  private async resolveCvId(
    candidateId: string,
    requestedCvId: string | undefined,
  ): Promise<string> {
    if (requestedCvId) {
      const cv = await this.prisma.cV.findFirst({
        where: { id: requestedCvId, candidateId },
      });
      if (!cv) {
        throw new UnprocessableEntityException(
          'cvId does not refer to one of your CVs.',
        );
      }
      return cv.id;
    }

    const primary = await this.prisma.cV.findFirst({
      where: { candidateId, isPrimary: true },
    });
    if (!primary) {
      throw new UnprocessableEntityException(
        'Attach a CV to apply -- upload one first or provide a cvId.',
      );
    }
    return primary.id;
  }

  private async requireOwnApplication(candidateId: string, id: string) {
    const application = await this.prisma.application.findFirst({
      where: { id, candidateId },
      include: applicationInclude,
    });
    if (!application) {
      throw new NotFoundException(APPLICATION_NOT_FOUND_MESSAGE);
    }
    return application;
  }

  private requireOrgId(orgId: string | null): string {
    if (!orgId) {
      throw new NotFoundException(NO_ORG_CONTEXT_MESSAGE);
    }
    return orgId;
  }

  private async requireJobApplication(
    organizationId: string,
    jobId: string,
    id: string,
  ) {
    const application = await this.prisma.application.findFirst({
      where: { id, jobId, organizationId },
      include: orgApplicationInclude,
    });
    if (!application) {
      throw new NotFoundException(APPLICATION_NOT_FOUND_MESSAGE);
    }
    return application;
  }

  private toDetail(application: ApplicationWithRelations) {
    return {
      id: application.id,
      status: application.status,
      coverNote: application.coverNote,
      appliedAt: application.appliedAt,
      updatedAt: application.updatedAt,
      job: {
        id: application.job.id,
        title: application.job.title,
        organization: {
          id: application.job.organization.id,
          name: application.job.organization.name,
        },
      },
      cv: { id: application.cv.id, fileName: application.cv.fileName },
      stage: { id: application.stage.id, name: application.stage.name },
    };
  }

  private toOrgDetail(application: ApplicationWithOrgRelations) {
    return {
      id: application.id,
      status: application.status,
      coverNote: application.coverNote,
      rejectedReason: application.rejectedReason,
      appliedAt: application.appliedAt,
      updatedAt: application.updatedAt,
      candidate: {
        id: application.candidate.id,
        fullName: application.candidate.fullName,
        email: application.candidate.email,
      },
      cv: { id: application.cv.id, fileName: application.cv.fileName },
      stage: { id: application.stage.id, name: application.stage.name },
    };
  }
}
