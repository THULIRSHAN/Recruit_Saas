import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function createPrismaMock() {
  const job = { findUnique: jest.fn() };
  const cV = { findFirst: jest.fn() };
  const recruitmentStage = { findFirstOrThrow: jest.fn() };
  const application = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { job, cV, recruitmentStage, application };
  return {
    prisma: prisma as unknown as PrismaService,
    job,
    cV,
    recruitmentStage,
    application,
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
      const service = new ApplicationsService(prisma);

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
      const service = new ApplicationsService(prisma);

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
      const service = new ApplicationsService(prisma);

      await expect(
        service.create('user-1', { jobId: 'job-1' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(application.create).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when the given cvId does not belong to the candidate', async () => {
      const { prisma, job, cV } = createPrismaMock();
      mockPublishedJob(job);
      cV.findFirst.mockResolvedValue(null);
      const service = new ApplicationsService(prisma);

      await expect(
        service.create('user-1', { jobId: 'job-1', cvId: 'not-mine' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws NotFoundException for a nonexistent job', async () => {
      const { prisma, job } = createPrismaMock();
      job.findUnique.mockResolvedValue(null);
      const service = new ApplicationsService(prisma);

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
      const service = new ApplicationsService(prisma);

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
      const service = new ApplicationsService(prisma);

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
      const service = new ApplicationsService(prisma);

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
      const service = new ApplicationsService(prisma);

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
      const service = new ApplicationsService(prisma);

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
      const service = new ApplicationsService(prisma);

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
      const service = new ApplicationsService(prisma);

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
      const service = new ApplicationsService(prisma);

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
      const service = new ApplicationsService(prisma);

      await expect(service.withdraw('user-1', 'app-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(application.update).not.toHaveBeenCalled();
    });

    it("throws NotFoundException for another candidate's application, without updating", async () => {
      const { prisma, application } = createPrismaMock();
      application.findFirst.mockResolvedValue(null);
      const service = new ApplicationsService(prisma);

      await expect(service.withdraw('user-1', 'app-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(application.update).not.toHaveBeenCalled();
    });
  });
});
