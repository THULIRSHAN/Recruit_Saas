import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

function createNotificationsServiceMock() {
  return {
    notify: jest.fn(),
  } as unknown as jest.Mocked<NotificationsService>;
}

function createPrismaMock() {
  const job = { findUnique: jest.fn() };
  const cV = { findFirst: jest.fn() };
  const recruitmentStage = {
    findFirstOrThrow: jest.fn(),
    findFirst: jest.fn(),
  };
  const application = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const txMock = {
    application: { update: jest.fn() },
    auditLog: { create: jest.fn() },
    applicationStageHistory: { create: jest.fn() },
  };
  const prisma = {
    job,
    cV,
    recruitmentStage,
    application,
    $transaction: jest.fn((arg: (tx: typeof txMock) => unknown) => arg(txMock)),
  };
  return {
    prisma: prisma as unknown as PrismaService,
    job,
    cV,
    recruitmentStage,
    application,
    tx: txMock,
  };
}

const baseApplication = {
  id: 'app-1',
  status: 'ACTIVE',
  coverNote: null,
  appliedAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  job: {
    id: 'job-1',
    title: 'Software Engineer',
    organization: { id: 'org-1', name: 'Acme' },
  },
  cv: { id: 'cv-1', fileName: 'resume.pdf' },
  stage: { id: 'stage-1', name: 'Applied' },
};

const baseOrgApplication = {
  id: 'app-1',
  status: 'ACTIVE',
  coverNote: null,
  rejectedReason: null,
  appliedAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  candidate: {
    id: 'cand-1',
    fullName: 'Jane Candidate',
    email: 'jane@example.com',
  },
  cv: { id: 'cv-1', fileName: 'resume.pdf' },
  stage: { id: 'stage-1', name: 'Applied', order: 1 },
};

describe('ApplicationsService', () => {
  describe('create', () => {
    function mockPublishedJob(job: ReturnType<typeof createPrismaMock>['job']) {
      job.findUnique.mockResolvedValue({
        id: 'job-1',
        status: 'PUBLISHED',
        organizationId: 'org-1',
        organization: { status: 'ACTIVE' },
      });
    }

    it('creates an application using the provided cvId (happy path)', async () => {
      const { prisma, job, cV, recruitmentStage, application } =
        createPrismaMock();
      mockPublishedJob(job);
      cV.findFirst.mockResolvedValue({ id: 'cv-1' });
      recruitmentStage.findFirstOrThrow.mockResolvedValue({ id: 'stage-1' });
      application.create.mockResolvedValue(baseApplication);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      const result = await service.create('user-1', {
        jobId: 'job-1',
        cvId: 'cv-1',
      });

      expect(application.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            jobId: 'job-1',
            candidateId: 'user-1',
            organizationId: 'org-1',
            cvId: 'cv-1',
            stageId: 'stage-1',
          }) as unknown,
        }),
      );
      expect(result).toMatchObject({ id: 'app-1', status: 'ACTIVE' });
    });

    it('falls back to the primary CV when no cvId is given', async () => {
      const { prisma, job, cV, recruitmentStage, application } =
        createPrismaMock();
      mockPublishedJob(job);
      cV.findFirst.mockResolvedValue({ id: 'cv-primary' });
      recruitmentStage.findFirstOrThrow.mockResolvedValue({ id: 'stage-1' });
      application.create.mockResolvedValue(baseApplication);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await service.create('user-1', { jobId: 'job-1' });

      expect(cV.findFirst).toHaveBeenCalledWith({
        where: { candidateId: 'user-1', isPrimary: true },
      });
      expect(application.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cvId: 'cv-primary' }) as unknown,
        }),
      );
    });

    it('throws UnprocessableEntityException when no cvId is given and no primary CV exists', async () => {
      const { prisma, job, cV, application } = createPrismaMock();
      mockPublishedJob(job);
      cV.findFirst.mockResolvedValue(null);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(
        service.create('user-1', { jobId: 'job-1' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(application.create).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when the given cvId does not belong to the candidate', async () => {
      const { prisma, job, cV } = createPrismaMock();
      mockPublishedJob(job);
      cV.findFirst.mockResolvedValue(null);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(
        service.create('user-1', { jobId: 'job-1', cvId: 'not-mine' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws NotFoundException for a nonexistent job', async () => {
      const { prisma, job } = createPrismaMock();
      job.findUnique.mockResolvedValue(null);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(
        service.create('user-1', { jobId: 'job-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for a job that is not PUBLISHED', async () => {
      const { prisma, job } = createPrismaMock();
      job.findUnique.mockResolvedValue({
        id: 'job-1',
        status: 'DRAFT',
        organizationId: 'org-1',
        organization: { status: 'ACTIVE' },
      });
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(
        service.create('user-1', { jobId: 'job-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for a PUBLISHED job at a non-ACTIVE org', async () => {
      const { prisma, job } = createPrismaMock();
      job.findUnique.mockResolvedValue({
        id: 'job-1',
        status: 'PUBLISHED',
        organizationId: 'org-1',
        organization: { status: 'SUSPENDED' },
      });
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(
        service.create('user-1', { jobId: 'job-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when a P2002 unique-constraint error is raised (duplicate active application)', async () => {
      const { prisma, job, cV, recruitmentStage, application } =
        createPrismaMock();
      mockPublishedJob(job);
      cV.findFirst.mockResolvedValue({ id: 'cv-1' });
      recruitmentStage.findFirstOrThrow.mockResolvedValue({ id: 'stage-1' });
      application.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(
        service.create('user-1', { jobId: 'job-1', cvId: 'cv-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listMine', () => {
    it('scopes results to the caller with pagination', async () => {
      const { prisma, application } = createPrismaMock();
      application.findMany.mockResolvedValue([baseApplication]);
      application.count.mockResolvedValue(1);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      const result = await service.listMine('user-1', {
        page: 1,
        pageSize: 20,
      });

      expect(application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { candidateId: 'user-1' } }),
      );
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('applies the status filter when given', async () => {
      const { prisma, application } = createPrismaMock();
      application.findMany.mockResolvedValue([]);
      application.count.mockResolvedValue(0);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await service.listMine('user-1', {
        status: 'WITHDRAWN',
        page: 1,
        pageSize: 20,
      });

      expect(application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { candidateId: 'user-1', status: 'WITHDRAWN' },
        }),
      );
    });
  });

  describe('getMine', () => {
    it('returns an application scoped to the caller', async () => {
      const { prisma, application } = createPrismaMock();
      application.findFirst.mockResolvedValue(baseApplication);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      const result = await service.getMine('user-1', 'app-1');

      expect(application.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1', candidateId: 'user-1' },
        }),
      );
      expect(result.id).toBe('app-1');
    });

    it("throws NotFoundException for another candidate's application", async () => {
      const { prisma, application } = createPrismaMock();
      application.findFirst.mockResolvedValue(null);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(service.getMine('user-1', 'app-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('withdraw', () => {
    it('withdraws an ACTIVE application scoped to the caller', async () => {
      const { prisma, application } = createPrismaMock();
      application.findFirst.mockResolvedValue(baseApplication);
      application.update.mockResolvedValue({
        ...baseApplication,
        status: 'WITHDRAWN',
      });
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      const result = await service.withdraw('user-1', 'app-1');

      expect(application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1' },
          data: { status: 'WITHDRAWN' },
        }),
      );
      expect(result.status).toBe('WITHDRAWN');
    });

    it('throws ConflictException if the application is not ACTIVE', async () => {
      const { prisma, application } = createPrismaMock();
      application.findFirst.mockResolvedValue({
        ...baseApplication,
        status: 'WITHDRAWN',
      });
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(service.withdraw('user-1', 'app-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(application.update).not.toHaveBeenCalled();
    });

    it("throws NotFoundException for another candidate's application, without updating", async () => {
      const { prisma, application } = createPrismaMock();
      application.findFirst.mockResolvedValue(null);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(service.withdraw('user-1', 'app-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(application.update).not.toHaveBeenCalled();
    });
  });

  describe('listForJob', () => {
    it('scopes results to the job and organization with pagination', async () => {
      const { prisma, application } = createPrismaMock();
      application.findMany.mockResolvedValue([baseOrgApplication]);
      application.count.mockResolvedValue(1);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      const result = await service.listForJob('org-1', 'job-1', {
        page: 1,
        pageSize: 20,
      });

      expect(application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jobId: 'job-1', organizationId: 'org-1' },
        }),
      );
      expect(result.data[0]).toMatchObject({
        id: 'app-1',
        candidate: { id: 'cand-1' },
      });
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('applies the status filter when given', async () => {
      const { prisma, application } = createPrismaMock();
      application.findMany.mockResolvedValue([]);
      application.count.mockResolvedValue(0);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await service.listForJob('org-1', 'job-1', {
        status: 'REJECTED',
        page: 1,
        pageSize: 20,
      });

      expect(application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            jobId: 'job-1',
            organizationId: 'org-1',
            status: 'REJECTED',
          },
        }),
      );
    });

    it('throws NotFoundException when there is no organization in session context', async () => {
      const { prisma } = createPrismaMock();
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(
        service.listForJob(null, 'job-1', { page: 1, pageSize: 20 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getForJob', () => {
    it('returns an application scoped to the job and organization', async () => {
      const { prisma, application } = createPrismaMock();
      application.findFirst.mockResolvedValue(baseOrgApplication);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      const result = await service.getForJob('org-1', 'job-1', 'app-1');

      expect(application.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1', jobId: 'job-1', organizationId: 'org-1' },
        }),
      );
      expect(result.id).toBe('app-1');
    });

    it('throws NotFoundException for an application outside this job/org', async () => {
      const { prisma, application } = createPrismaMock();
      application.findFirst.mockResolvedValue(null);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(
        service.getForJob('org-1', 'job-1', 'app-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('screen', () => {
    it('rejects an ACTIVE application with an optional reason', async () => {
      const { prisma, application, tx } = createPrismaMock();
      application.findFirst.mockResolvedValue(baseOrgApplication);
      tx.application.update.mockResolvedValue({
        ...baseOrgApplication,
        status: 'REJECTED',
        rejectedReason: 'Not enough experience.',
      });
      const notificationsService = createNotificationsServiceMock();
      const service = new ApplicationsService(prisma, notificationsService);

      const result = await service.screen(
        'org-1',
        'actor-1',
        'job-1',
        'app-1',
        {
          decision: 'REJECT',
          reason: 'Not enough experience.',
        },
      );

      expect(tx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1' },
          data: {
            status: 'REJECTED',
            rejectedReason: 'Not enough experience.',
          },
        }),
      );
      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'actor-1',
            organizationId: 'org-1',
            action: 'application.rejected',
            targetId: 'app-1',
          }) as unknown,
        }),
      );
      expect(notificationsService.notify).toHaveBeenCalledWith(
        'cand-1',
        'application.rejected',
        expect.objectContaining({
          applicationId: 'app-1',
          reason: 'Not enough experience.',
          source: 'screening',
        }) as unknown,
      );
      expect(result.status).toBe('REJECTED');
    });

    it('advances a PASSing application to the next stage by order', async () => {
      const { prisma, application, recruitmentStage, tx } = createPrismaMock();
      application.findFirst.mockResolvedValue(baseOrgApplication);
      recruitmentStage.findFirst.mockResolvedValue({
        id: 'stage-2',
        order: 2,
      });
      tx.application.update.mockResolvedValue({
        ...baseOrgApplication,
        stage: { id: 'stage-2', name: 'Shortlisted', order: 2 },
      });
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      const result = await service.screen(
        'org-1',
        'actor-1',
        'job-1',
        'app-1',
        {
          decision: 'PASS',
        },
      );

      expect(recruitmentStage.findFirst).toHaveBeenCalledWith({
        where: { jobId: 'job-1', order: 2 },
      });
      expect(tx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1' },
          data: { stageId: 'stage-2' },
        }),
      );
      expect(tx.applicationStageHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            applicationId: 'app-1',
            fromStageId: 'stage-1',
            toStageId: 'stage-2',
            movedById: 'actor-1',
          },
        }),
      );
      expect(result.stage.id).toBe('stage-2');
    });

    it('throws UnprocessableEntityException when PASSing from the last stage', async () => {
      const { prisma, application, recruitmentStage } = createPrismaMock();
      application.findFirst.mockResolvedValue(baseOrgApplication);
      recruitmentStage.findFirst.mockResolvedValue(null);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(
        service.screen('org-1', 'actor-1', 'job-1', 'app-1', {
          decision: 'PASS',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws ConflictException when the application is not ACTIVE', async () => {
      const { prisma, application } = createPrismaMock();
      application.findFirst.mockResolvedValue({
        ...baseOrgApplication,
        status: 'WITHDRAWN',
      });
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(
        service.screen('org-1', 'actor-1', 'job-1', 'app-1', {
          decision: 'REJECT',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException for an application outside this job/org', async () => {
      const { prisma, application } = createPrismaMock();
      application.findFirst.mockResolvedValue(null);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(
        service.screen('org-1', 'actor-1', 'job-1', 'app-1', {
          decision: 'REJECT',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('decide', () => {
    it('hires an ACTIVE application', async () => {
      const { prisma, application, tx } = createPrismaMock();
      application.findFirst.mockResolvedValue(baseOrgApplication);
      tx.application.update.mockResolvedValue({
        ...baseOrgApplication,
        status: 'HIRED',
      });
      const notificationsService = createNotificationsServiceMock();
      const service = new ApplicationsService(prisma, notificationsService);

      const result = await service.decide(
        'org-1',
        'actor-1',
        'job-1',
        'app-1',
        { decision: 'HIRE' },
      );

      expect(tx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1' },
          data: { status: 'HIRED' },
        }),
      );
      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'application.hired',
            targetId: 'app-1',
          }) as unknown,
        }),
      );
      // HIRE has nothing to notify about (the Offer workflow, M10, is what
      // informs the candidate) -- see Q28.
      expect(notificationsService.notify).not.toHaveBeenCalled();
      expect(result.status).toBe('HIRED');
    });

    it('rejects an ACTIVE application with an optional reason', async () => {
      const { prisma, application, tx } = createPrismaMock();
      application.findFirst.mockResolvedValue(baseOrgApplication);
      tx.application.update.mockResolvedValue({
        ...baseOrgApplication,
        status: 'REJECTED',
        rejectedReason: 'Panel unanimous no.',
      });
      const notificationsService = createNotificationsServiceMock();
      const service = new ApplicationsService(prisma, notificationsService);

      const result = await service.decide(
        'org-1',
        'actor-1',
        'job-1',
        'app-1',
        { decision: 'REJECT', reason: 'Panel unanimous no.' },
      );

      expect(tx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1' },
          data: {
            status: 'REJECTED',
            rejectedReason: 'Panel unanimous no.',
          },
        }),
      );
      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'application.rejected',
            targetId: 'app-1',
          }) as unknown,
        }),
      );
      expect(notificationsService.notify).toHaveBeenCalledWith(
        'cand-1',
        'application.rejected',
        expect.objectContaining({
          applicationId: 'app-1',
          reason: 'Panel unanimous no.',
          source: 'decision',
        }) as unknown,
      );
      expect(result.status).toBe('REJECTED');
    });

    it('throws ConflictException when the application is not ACTIVE', async () => {
      const { prisma, application } = createPrismaMock();
      application.findFirst.mockResolvedValue({
        ...baseOrgApplication,
        status: 'WITHDRAWN',
      });
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(
        service.decide('org-1', 'actor-1', 'job-1', 'app-1', {
          decision: 'HIRE',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException for an application outside this job/org', async () => {
      const { prisma, application } = createPrismaMock();
      application.findFirst.mockResolvedValue(null);
      const service = new ApplicationsService(
        prisma,
        createNotificationsServiceMock(),
      );

      await expect(
        service.decide('org-1', 'actor-1', 'job-1', 'app-1', {
          decision: 'HIRE',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
