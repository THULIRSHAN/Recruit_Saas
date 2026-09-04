import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApplicationsService } from '../applications/applications.service';
import { Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { InterviewsService } from './interviews.service';

function createNotificationsServiceMock() {
  return {
    notify: jest.fn(),
  } as unknown as jest.Mocked<NotificationsService>;
}

function createPrismaMock() {
  const interview = {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  };
  const userOrganizationRole = { findMany: jest.fn() };
  const interviewPanelMember = { findFirst: jest.fn() };
  const evaluation = { create: jest.fn(), findMany: jest.fn() };
  const txMock = {
    interview: { create: jest.fn(), update: jest.fn() },
  };
  const prisma = {
    interview,
    userOrganizationRole,
    interviewPanelMember,
    evaluation,
    $transaction: jest.fn((arg: (tx: typeof txMock) => unknown) => arg(txMock)),
  };
  return {
    prisma: prisma as unknown as PrismaService,
    interview,
    userOrganizationRole,
    interviewPanelMember,
    evaluation,
    tx: txMock,
  };
}

function createApplicationsServiceMock() {
  return {
    getForJob: jest.fn(),
  } as unknown as jest.Mocked<ApplicationsService>;
}

const basePanelInterview = {
  id: 'interview-1',
  scheduledAt: new Date('2026-02-01T10:00:00Z'),
  mode: 'VIDEO',
  status: 'SCHEDULED',
  rescheduledToId: null,
  panel: [
    {
      id: 'panel-1',
      interviewer: {
        id: 'interviewer-1',
        fullName: 'Ivy Interviewer',
        email: 'ivy@example.com',
      },
    },
  ],
};

describe('InterviewsService', () => {
  describe('schedule', () => {
    it('schedules an interview for an ACTIVE application with a panel (happy path)', async () => {
      const { prisma, interview, userOrganizationRole } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockResolvedValue({
        id: 'app-1',
        status: 'ACTIVE',
      } as never);
      userOrganizationRole.findMany.mockResolvedValue([
        { userId: 'interviewer-1' },
      ]);
      interview.create.mockResolvedValue(basePanelInterview);
      const notificationsService = createNotificationsServiceMock();
      const service = new InterviewsService(
        prisma,
        applicationsService,
        notificationsService,
      );

      const result = await service.schedule('org-1', 'job-1', 'app-1', {
        scheduledAt: '2026-02-01T10:00:00Z',
        mode: 'VIDEO',
        interviewerIds: ['interviewer-1'],
      });

      expect(applicationsService.getForJob).toHaveBeenCalledWith(
        'org-1',
        'job-1',
        'app-1',
      );
      expect(interview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            applicationId: 'app-1',
            organizationId: 'org-1',
            mode: 'VIDEO',
            panel: { create: [{ interviewerId: 'interviewer-1' }] },
          }) as unknown,
        }),
      );
      expect(notificationsService.notify).toHaveBeenCalledWith(
        'interviewer-1',
        'interview.scheduled',
        expect.objectContaining({
          interviewId: 'interview-1',
          applicationId: 'app-1',
        }) as unknown,
      );
      expect(result.panel[0].interviewer.id).toBe('interviewer-1');
    });

    it('throws ConflictException when the application is not ACTIVE', async () => {
      const { prisma } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockResolvedValue({
        id: 'app-1',
        status: 'REJECTED',
      } as never);
      const service = new InterviewsService(
        prisma,
        applicationsService,
        createNotificationsServiceMock(),
      );

      await expect(
        service.schedule('org-1', 'job-1', 'app-1', {
          scheduledAt: '2026-02-01T10:00:00Z',
          mode: 'VIDEO',
          interviewerIds: ['interviewer-1'],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws UnprocessableEntityException when an interviewerId is not a member of the organization', async () => {
      const { prisma, userOrganizationRole } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockResolvedValue({
        id: 'app-1',
        status: 'ACTIVE',
      } as never);
      userOrganizationRole.findMany.mockResolvedValue([]);
      const service = new InterviewsService(
        prisma,
        applicationsService,
        createNotificationsServiceMock(),
      );

      await expect(
        service.schedule('org-1', 'job-1', 'app-1', {
          scheduledAt: '2026-02-01T10:00:00Z',
          mode: 'VIDEO',
          interviewerIds: ['outsider-1'],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('propagates NotFoundException from a cross-tenant/nonexistent application', async () => {
      const { prisma } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockRejectedValue(
        new NotFoundException('Application not found.'),
      );
      const service = new InterviewsService(
        prisma,
        applicationsService,
        createNotificationsServiceMock(),
      );

      await expect(
        service.schedule('org-1', 'job-1', 'app-1', {
          scheduledAt: '2026-02-01T10:00:00Z',
          mode: 'VIDEO',
          interviewerIds: ['interviewer-1'],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reschedule', () => {
    it('marks the old interview RESCHEDULED and creates a new one with the same panel', async () => {
      const { prisma, interview, tx } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockResolvedValue({
        id: 'app-1',
        status: 'ACTIVE',
      } as never);
      interview.findFirst.mockResolvedValue({
        id: 'interview-1',
        status: 'SCHEDULED',
        mode: 'VIDEO',
        panel: [{ interviewerId: 'interviewer-1' }],
      });
      tx.interview.create.mockResolvedValue({
        ...basePanelInterview,
        id: 'interview-2',
      });
      const service = new InterviewsService(
        prisma,
        applicationsService,
        createNotificationsServiceMock(),
      );

      const result = await service.reschedule(
        'org-1',
        'job-1',
        'app-1',
        'interview-1',
        { scheduledAt: '2026-02-05T10:00:00Z' },
      );

      expect(tx.interview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mode: 'VIDEO',
            panel: { create: [{ interviewerId: 'interviewer-1' }] },
          }) as unknown,
        }),
      );
      expect(tx.interview.update).toHaveBeenCalledWith({
        where: { id: 'interview-1' },
        data: { status: 'RESCHEDULED', rescheduledToId: 'interview-2' },
      });
      expect(result.id).toBe('interview-2');
    });

    it('throws NotFoundException for an interview outside this job/application', async () => {
      const { prisma, interview } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockResolvedValue({
        id: 'app-1',
        status: 'ACTIVE',
      } as never);
      interview.findFirst.mockResolvedValue(null);
      const service = new InterviewsService(
        prisma,
        applicationsService,
        createNotificationsServiceMock(),
      );

      await expect(
        service.reschedule('org-1', 'job-1', 'app-1', 'interview-1', {
          scheduledAt: '2026-02-05T10:00:00Z',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when the interview is not SCHEDULED', async () => {
      const { prisma, interview } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockResolvedValue({
        id: 'app-1',
        status: 'ACTIVE',
      } as never);
      interview.findFirst.mockResolvedValue({
        id: 'interview-1',
        status: 'RESCHEDULED',
        mode: 'VIDEO',
        panel: [],
      });
      const service = new InterviewsService(
        prisma,
        applicationsService,
        createNotificationsServiceMock(),
      );

      await expect(
        service.reschedule('org-1', 'job-1', 'app-1', 'interview-1', {
          scheduledAt: '2026-02-05T10:00:00Z',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listMine', () => {
    it('scopes results to interviews the caller is a panel member of', async () => {
      const { prisma, interview } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      interview.findMany.mockResolvedValue([
        {
          id: 'interview-1',
          scheduledAt: new Date('2026-02-01T10:00:00Z'),
          mode: 'VIDEO',
          status: 'SCHEDULED',
          rescheduledToId: null,
          application: {
            id: 'app-1',
            job: { id: 'job-1', title: 'Software Engineer' },
            candidate: { id: 'cand-1', fullName: 'Jane Candidate' },
          },
        },
      ]);
      interview.count.mockResolvedValue(1);
      const service = new InterviewsService(
        prisma,
        applicationsService,
        createNotificationsServiceMock(),
      );

      const result = await service.listMine('interviewer-1', {
        page: 1,
        pageSize: 20,
      });

      expect(interview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { panel: { some: { interviewerId: 'interviewer-1' } } },
        }),
      );
      expect(result.data[0].application.candidate.id).toBe('cand-1');
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });
  });

  describe('submitEvaluation', () => {
    it("creates an evaluation for the caller's own panel assignment (happy path)", async () => {
      const { prisma, interviewPanelMember, evaluation } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      interviewPanelMember.findFirst.mockResolvedValue({
        id: 'panel-1',
        interviewId: 'interview-1',
        interviewerId: 'interviewer-1',
      });
      evaluation.create.mockResolvedValue({
        id: 'eval-1',
        scores: { communication: 4 },
        comment: 'Strong candidate.',
        recommendation: 'YES',
        submittedAt: new Date('2026-02-01T12:00:00Z'),
      });
      const service = new InterviewsService(
        prisma,
        applicationsService,
        createNotificationsServiceMock(),
      );

      const result = await service.submitEvaluation(
        'interviewer-1',
        'interview-1',
        {
          scores: { communication: 4 },
          comment: 'Strong candidate.',
          recommendation: 'YES',
        },
      );

      expect(interviewPanelMember.findFirst).toHaveBeenCalledWith({
        where: { interviewId: 'interview-1', interviewerId: 'interviewer-1' },
      });
      expect(evaluation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            panelMemberId: 'panel-1',
            scores: { communication: 4 },
            recommendation: 'YES',
          }) as unknown,
        }),
      );
      expect(result.id).toBe('eval-1');
    });

    it('throws ForbiddenException when the caller is not a panel member of this interview', async () => {
      const { prisma, interviewPanelMember } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      interviewPanelMember.findFirst.mockResolvedValue(null);
      const service = new InterviewsService(
        prisma,
        applicationsService,
        createNotificationsServiceMock(),
      );

      await expect(
        service.submitEvaluation('outsider-1', 'interview-1', {
          scores: { communication: 4 },
          recommendation: 'YES',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException when a score is outside 1-5', async () => {
      const { prisma, interviewPanelMember } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      interviewPanelMember.findFirst.mockResolvedValue({
        id: 'panel-1',
        interviewId: 'interview-1',
        interviewerId: 'interviewer-1',
      });
      const service = new InterviewsService(
        prisma,
        applicationsService,
        createNotificationsServiceMock(),
      );

      await expect(
        service.submitEvaluation('interviewer-1', 'interview-1', {
          scores: { communication: 6 },
          recommendation: 'YES',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException on a duplicate submission (P2002)', async () => {
      const { prisma, interviewPanelMember, evaluation } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      interviewPanelMember.findFirst.mockResolvedValue({
        id: 'panel-1',
        interviewId: 'interview-1',
        interviewerId: 'interviewer-1',
      });
      evaluation.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const service = new InterviewsService(
        prisma,
        applicationsService,
        createNotificationsServiceMock(),
      );

      await expect(
        service.submitEvaluation('interviewer-1', 'interview-1', {
          scores: { communication: 4 },
          recommendation: 'YES',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listEvaluationsForApplication', () => {
    it('returns evaluations scoped to the application, with interviewer identity', async () => {
      const { prisma, evaluation } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockResolvedValue({
        id: 'app-1',
        status: 'ACTIVE',
      } as never);
      evaluation.findMany.mockResolvedValue([
        {
          id: 'eval-1',
          scores: { communication: 4 },
          comment: null,
          recommendation: 'YES',
          submittedAt: new Date('2026-02-01T12:00:00Z'),
          panelMember: {
            interviewId: 'interview-1',
            interviewer: {
              id: 'interviewer-1',
              fullName: 'Ivy Interviewer',
              email: 'ivy@example.com',
            },
          },
        },
      ]);
      const service = new InterviewsService(
        prisma,
        applicationsService,
        createNotificationsServiceMock(),
      );

      const result = await service.listEvaluationsForApplication(
        'org-1',
        'job-1',
        'app-1',
      );

      expect(applicationsService.getForJob).toHaveBeenCalledWith(
        'org-1',
        'job-1',
        'app-1',
      );
      expect(evaluation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            panelMember: {
              interview: { applicationId: 'app-1', organizationId: 'org-1' },
            },
          },
        }),
      );
      expect(result[0].interviewer.id).toBe('interviewer-1');
    });

    it('propagates NotFoundException from a cross-tenant/nonexistent application', async () => {
      const { prisma } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockRejectedValue(
        new NotFoundException('Application not found.'),
      );
      const service = new InterviewsService(
        prisma,
        applicationsService,
        createNotificationsServiceMock(),
      );

      await expect(
        service.listEvaluationsForApplication('org-1', 'job-1', 'app-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
