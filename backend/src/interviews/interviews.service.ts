import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApplicationsService } from '../applications/applications.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListMyInterviewsQueryDto } from './dto/list-my-interviews-query.dto';
import { RescheduleInterviewDto } from './dto/reschedule-interview.dto';
import { ScheduleInterviewDto } from './dto/schedule-interview.dto';
import { SubmitEvaluationDto } from './dto/submit-evaluation.dto';

const INTERVIEW_NOT_FOUND_MESSAGE = 'Interview not found.';
const NO_ORG_CONTEXT_MESSAGE = 'No organization in session context.';
// docs/testing.md §2 case 8's literal example: "Interviewer (not assigned
// to this application's interview) tries to submit an evaluation | 403" --
// 403, not the more common 404-for-ownership-mismatch pattern used
// elsewhere, because the interview itself is visible/known to exist to
// any interviewer at the org; it's specifically *this* interviewer's lack
// of an assignment that's being rejected.
const NOT_ASSIGNED_MESSAGE =
  'You are not assigned to this interview as a panel member.';

const panelInclude = {
  panel: {
    select: {
      id: true,
      interviewer: { select: { id: true, fullName: true, email: true } },
    },
  },
} satisfies Prisma.InterviewInclude;

type InterviewWithPanel = Prisma.InterviewGetPayload<{
  include: typeof panelInclude;
}>;

// REQ-INT-003: an interviewer's own view needs candidate/job context, not
// panel identities (they already know who else is on the panel from the
// invite) -- a different shape from the org-staff panelInclude above.
const myInterviewInclude = {
  application: {
    select: {
      id: true,
      job: { select: { id: true, title: true } },
      candidate: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.InterviewInclude;

type InterviewWithApplication = Prisma.InterviewGetPayload<{
  include: typeof myInterviewInclude;
}>;

// REQ-EVAL-002: Recruiter/Hiring Manager's aggregate view needs the
// interviewer's identity and which interview each score belongs to.
const evaluationInclude = {
  panelMember: {
    select: {
      interviewId: true,
      interviewer: { select: { id: true, fullName: true, email: true } },
    },
  },
} satisfies Prisma.EvaluationInclude;

type EvaluationWithPanelMember = Prisma.EvaluationGetPayload<{
  include: typeof evaluationInclude;
}>;

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applicationsService: ApplicationsService,
  ) {}

  // REQ-INT-001/002. Delegates existence/tenant-scoping to
  // ApplicationsService.getForJob() rather than querying prisma.application
  // directly (CLAUDE.md rule 4 -- Application belongs to the Applications
  // module).
  async schedule(
    orgId: string | null,
    jobId: string,
    applicationId: string,
    dto: ScheduleInterviewDto,
  ) {
    const organizationId = this.requireOrgId(orgId);
    const application = await this.applicationsService.getForJob(
      organizationId,
      jobId,
      applicationId,
    );
    if (application.status !== 'ACTIVE') {
      throw new ConflictException(
        `Cannot schedule an interview for a(n) ${application.status.toLowerCase()} application.`,
      );
    }
    await this.requireOrgMembers(organizationId, dto.interviewerIds);

    const interview = await this.prisma.interview.create({
      data: {
        applicationId,
        organizationId,
        scheduledAt: dto.scheduledAt,
        mode: dto.mode,
        panel: {
          create: dto.interviewerIds.map((interviewerId) => ({
            interviewerId,
          })),
        },
      },
      include: panelInclude,
    });
    return this.toDetail(interview);
  }

  // REQ-INT-001: "do not hard-delete the old slot; mark RESCHEDULED and
  // link to the new one" -- the old row keeps its own history untouched,
  // a fresh Interview carries the new slot and inherits the same panel.
  async reschedule(
    orgId: string | null,
    jobId: string,
    applicationId: string,
    interviewId: string,
    dto: RescheduleInterviewDto,
  ) {
    const organizationId = this.requireOrgId(orgId);
    await this.applicationsService.getForJob(
      organizationId,
      jobId,
      applicationId,
    );
    const existing = await this.prisma.interview.findFirst({
      where: { id: interviewId, applicationId, organizationId },
      include: { panel: true },
    });
    if (!existing) {
      throw new NotFoundException(INTERVIEW_NOT_FOUND_MESSAGE);
    }
    if (existing.status !== 'SCHEDULED') {
      throw new ConflictException(
        `Interview is already ${existing.status.toLowerCase()}.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const next = await tx.interview.create({
        data: {
          applicationId,
          organizationId,
          scheduledAt: dto.scheduledAt,
          mode: dto.mode ?? existing.mode,
          panel: {
            create: existing.panel.map((member) => ({
              interviewerId: member.interviewerId,
            })),
          },
        },
        include: panelInclude,
      });
      await tx.interview.update({
        where: { id: existing.id },
        data: { status: 'RESCHEDULED', rescheduledToId: next.id },
      });
      return this.toDetail(next);
    });
  }

  // REQ-INT-003: filtered in the query layer, not just the UI -- an
  // interviewer only ever sees interviews they are personally a panel
  // member of.
  async listMine(interviewerId: string, query: ListMyInterviewsQueryDto) {
    const where = { panel: { some: { interviewerId } } };

    const [data, total] = await Promise.all([
      this.prisma.interview.findMany({
        where,
        orderBy: { scheduledAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: myInterviewInclude,
      }),
      this.prisma.interview.count({ where }),
    ]);

    return {
      data: data.map((interview) => this.toMineDetail(interview)),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // REQ-EVAL-001/Q5/Q25: exactly one evaluation per panel assignment (the
  // DB's @unique([panelMemberId]) is the authoritative enforcement, caught
  // here as P2002, same race-avoidance reasoning as M7.3's duplicate-
  // application check) -- and per Q25, deliberately no companion "read my
  // evaluations" method exists on this service, so a submitted evaluation
  // is never readable by any interviewer, including its own author.
  async submitEvaluation(
    interviewerId: string,
    interviewId: string,
    dto: SubmitEvaluationDto,
  ) {
    const panelMember = await this.prisma.interviewPanelMember.findFirst({
      where: { interviewId, interviewerId },
    });
    if (!panelMember) {
      throw new ForbiddenException(NOT_ASSIGNED_MESSAGE);
    }
    this.validateScores(dto.scores);

    try {
      const evaluation = await this.prisma.evaluation.create({
        data: {
          panelMemberId: panelMember.id,
          scores: dto.scores,
          comment: dto.comment,
          recommendation: dto.recommendation,
        },
      });
      return {
        id: evaluation.id,
        scores: evaluation.scores,
        comment: evaluation.comment,
        recommendation: evaluation.recommendation,
        submittedAt: evaluation.submittedAt,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'You have already submitted an evaluation for this interview.',
        );
      }
      throw error;
    }
  }

  // REQ-EVAL-002 (Q24: added evaluation:read to Recruiter's permissions to
  // match this requirement's stated actors). Delegates existence/tenant
  // scoping to ApplicationsService.getForJob(), same pattern as
  // schedule()/reschedule().
  async listEvaluationsForApplication(
    orgId: string | null,
    jobId: string,
    applicationId: string,
  ) {
    const organizationId = this.requireOrgId(orgId);
    await this.applicationsService.getForJob(
      organizationId,
      jobId,
      applicationId,
    );

    const evaluations = await this.prisma.evaluation.findMany({
      where: {
        panelMember: {
          interview: { applicationId, organizationId },
        },
      },
      orderBy: { submittedAt: 'asc' },
      include: evaluationInclude,
    });
    return evaluations.map((evaluation) => this.toEvaluationDetail(evaluation));
  }

  private validateScores(scores: Record<string, number>) {
    const entries = Object.entries(scores);
    const invalid = entries.some(
      ([, value]) => !Number.isInteger(value) || value < 1 || value > 5,
    );
    if (invalid) {
      throw new BadRequestException(
        'Each competency score must be an integer between 1 and 5.',
      );
    }
  }

  // REQ-INT-002: "an interviewer must belong to the same organization as
  // the job." UserOrganizationRole is a core identity/RBAC table (like
  // TenantGuard and PermissionsGuard already query directly), not a
  // feature-owned model -- unlike Job/Application, no module "owns" it.
  private async requireOrgMembers(
    organizationId: string,
    interviewerIds: string[],
  ) {
    const memberships = await this.prisma.userOrganizationRole.findMany({
      where: { organizationId, userId: { in: interviewerIds } },
      select: { userId: true },
    });
    const memberIds = new Set(memberships.map((m) => m.userId));
    const missing = interviewerIds.filter((id) => !memberIds.has(id));
    if (missing.length > 0) {
      throw new UnprocessableEntityException(
        'interviewerIds must all belong to this organization.',
      );
    }
  }

  private requireOrgId(orgId: string | null): string {
    if (!orgId) {
      throw new NotFoundException(NO_ORG_CONTEXT_MESSAGE);
    }
    return orgId;
  }

  private toDetail(interview: InterviewWithPanel) {
    return {
      id: interview.id,
      scheduledAt: interview.scheduledAt,
      mode: interview.mode,
      status: interview.status,
      rescheduledToId: interview.rescheduledToId,
      panel: interview.panel.map((member) => ({
        id: member.id,
        interviewer: {
          id: member.interviewer.id,
          fullName: member.interviewer.fullName,
          email: member.interviewer.email,
        },
      })),
    };
  }

  private toEvaluationDetail(evaluation: EvaluationWithPanelMember) {
    return {
      id: evaluation.id,
      scores: evaluation.scores,
      comment: evaluation.comment,
      recommendation: evaluation.recommendation,
      submittedAt: evaluation.submittedAt,
      interviewId: evaluation.panelMember.interviewId,
      interviewer: {
        id: evaluation.panelMember.interviewer.id,
        fullName: evaluation.panelMember.interviewer.fullName,
        email: evaluation.panelMember.interviewer.email,
      },
    };
  }

  private toMineDetail(interview: InterviewWithApplication) {
    return {
      id: interview.id,
      scheduledAt: interview.scheduledAt,
      mode: interview.mode,
      status: interview.status,
      rescheduledToId: interview.rescheduledToId,
      application: {
        id: interview.application.id,
        job: {
          id: interview.application.job.id,
          title: interview.application.job.title,
        },
        candidate: {
          id: interview.application.candidate.id,
          fullName: interview.application.candidate.fullName,
        },
      },
    };
  }
}
