import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { PipelineTemplatesService } from '../pipeline-templates/pipeline-templates.service';
import { PrismaService } from '../prisma/prisma.service';

function createPrismaMock() {
  const job = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const recruitmentStage = {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  };
  const application = {
    findFirst: jest.fn(),
  };
  const txMock = { recruitmentStage, application };
  const prisma = {
    job,
    recruitmentStage,
    application,
    $transaction: jest.fn((callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    ),
  };
  return {
    prisma: prisma as unknown as PrismaService,
    job,
    recruitmentStage,
    application,
  };
}

function createPipelineTemplatesServiceMock() {
  return { getOne: jest.fn() } as unknown as PipelineTemplatesService;
}

const baseJob = {
  id: 'job-1',
  organizationId: 'org-1',
  title: 'Software Engineer',
  description: 'Build things.',
  department: null,
  location: null,
  employmentType: null,
  salaryMin: null,
  salaryMax: null,
  status: 'DRAFT',
  createdById: 'user-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  publishedAt: null,
  closedAt: null,
};

describe('JobsService', () => {
  describe('create', () => {
    it('creates a DRAFT job scoped to the caller org, ignoring any client-supplied org', async () => {
      const { prisma, job } = createPrismaMock();
      job.create.mockResolvedValue(baseJob);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      const result = await service.create('org-1', 'user-1', {
        title: 'Software Engineer',
        description: 'Build things.',
      });

      expect(job.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          title: 'Software Engineer',
          description: 'Build things.',
          department: undefined,
          location: undefined,
          employmentType: undefined,
          salaryMin: undefined,
          salaryMax: undefined,
          createdById: 'user-1',
        },
      });
      expect(result).toMatchObject({ id: 'job-1', status: 'DRAFT' });
    });

    it('throws BadRequestException when salaryMin > salaryMax', async () => {
      const { prisma, job } = createPrismaMock();
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(
        service.create('org-1', 'user-1', {
          title: 'Software Engineer',
          description: 'Build things.',
          salaryMin: 100_000,
          salaryMax: 50_000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(job.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the caller has no org in their token', async () => {
      const { prisma, job } = createPrismaMock();
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(
        service.create(null, 'user-1', {
          title: 'Software Engineer',
          description: 'Build things.',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(job.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('filters by the caller org and optional status, applying pagination', async () => {
      const { prisma, job } = createPrismaMock();
      job.findMany.mockResolvedValue([baseJob]);
      job.count.mockResolvedValue(1);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      const result = await service.list('org-1', {
        status: 'DRAFT',
        page: 2,
        pageSize: 10,
      });

      expect(job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', status: 'DRAFT' },
          skip: 10,
          take: 10,
        }),
      );
      expect(result.meta).toEqual({ page: 2, pageSize: 10, total: 1 });
      expect(result.data).toHaveLength(1);
    });

    it('omits the status filter when none is given', async () => {
      const { prisma, job } = createPrismaMock();
      job.findMany.mockResolvedValue([]);
      job.count.mockResolvedValue(0);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await service.list('org-1', { page: 1, pageSize: 20 });

      expect(job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });
  });

  describe('getOne', () => {
    it('returns a job scoped to the caller org', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      const result = await service.getOne('org-1', 'job-1');

      expect(job.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-1', organizationId: 'org-1' },
      });
      expect(result).toMatchObject({ id: 'job-1' });
    });

    it('throws NotFoundException for a cross-tenant or nonexistent job', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue(null);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(service.getOne('org-1', 'job-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates a job scoped to the caller org, in any status', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      job.update.mockResolvedValue({ ...baseJob, title: 'Senior Engineer' });
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      const result = await service.update('org-1', 'job-1', {
        title: 'Senior Engineer',
      });

      expect(job.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-1', organizationId: 'org-1' },
      });
      expect(job.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { title: 'Senior Engineer' },
      });
      expect(result).toMatchObject({ title: 'Senior Engineer' });
    });

    it('throws NotFoundException for a cross-tenant or nonexistent job, without updating', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue(null);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(
        service.update('org-1', 'job-1', { title: 'Senior Engineer' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(job.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when salaryMin > salaryMax', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(
        service.update('org-1', 'job-1', {
          salaryMin: 100_000,
          salaryMax: 50_000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(job.update).not.toHaveBeenCalled();
    });
  });

  describe('listStages', () => {
    it('returns ordered stages for a job scoped to the caller org', async () => {
      const { prisma, job, recruitmentStage } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      recruitmentStage.findMany.mockResolvedValue([
        { id: 'stage-1', name: 'Applied', order: 0 },
      ]);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      const result = await service.listStages('org-1', 'job-1');

      expect(recruitmentStage.findMany).toHaveBeenCalledWith({
        where: { jobId: 'job-1' },
        orderBy: { order: 'asc' },
      });
      expect(result).toEqual([{ id: 'stage-1', name: 'Applied', order: 0 }]);
    });

    it('throws NotFoundException for a cross-tenant or nonexistent job', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue(null);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(service.listStages('org-1', 'job-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('replaceStages', () => {
    it('creates every stage fresh when the job has none yet', async () => {
      const { prisma, job, recruitmentStage, application } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      recruitmentStage.findMany
        .mockResolvedValueOnce([]) // existing, before
        .mockResolvedValueOnce([
          { id: 'stage-1', name: 'Applied', order: 0 },
          { id: 'stage-2', name: 'Interview', order: 1 },
        ]); // final read
      application.findFirst.mockResolvedValue(null);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      const result = await service.replaceStages('org-1', 'job-1', {
        stages: ['Applied', 'Interview'],
      });

      expect(recruitmentStage.create).toHaveBeenNthCalledWith(1, {
        data: { jobId: 'job-1', name: 'Applied', order: 0 },
      });
      expect(recruitmentStage.create).toHaveBeenNthCalledWith(2, {
        data: { jobId: 'job-1', name: 'Interview', order: 1 },
      });
      expect(recruitmentStage.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual([
        { id: 'stage-1', name: 'Applied', order: 0 },
        { id: 'stage-2', name: 'Interview', order: 1 },
      ]);
    });

    // Bug fix (2026-09-05/Q35): reorders/renames-in-place by reusing the
    // existing row's id for a name that survives, instead of deleting and
    // recreating every stage -- the crash this fixes only reproduces with a
    // real FK (covered by jobs.e2e-spec.ts), but this proves the diffing
    // logic itself doesn't touch a stage that isn't being removed.
    it('reuses (reorders) an existing stage whose name is kept, rather than deleting and recreating it', async () => {
      const { prisma, job, recruitmentStage, application } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      recruitmentStage.findMany
        .mockResolvedValueOnce([{ id: 'stage-1', name: 'Applied', order: 0 }])
        .mockResolvedValueOnce([
          { id: 'stage-1', name: 'Applied', order: 1 },
          { id: 'stage-2', name: 'Interview', order: 0 },
        ]);
      application.findFirst.mockResolvedValue(null);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await service.replaceStages('org-1', 'job-1', {
        stages: ['Interview', 'Applied'],
      });

      expect(recruitmentStage.update).toHaveBeenCalledWith({
        where: { id: 'stage-1' },
        data: { order: 1 },
      });
      expect(recruitmentStage.create).toHaveBeenCalledWith({
        data: { jobId: 'job-1', name: 'Interview', order: 0 },
      });
      expect(recruitmentStage.deleteMany).not.toHaveBeenCalled();
    });

    it('returns 409 and touches nothing when a candidate is still in the stage being removed', async () => {
      const { prisma, job, recruitmentStage, application } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      recruitmentStage.findMany.mockResolvedValueOnce([
        { id: 'stage-1', name: 'Applied', order: 0 },
      ]);
      application.findFirst.mockResolvedValue({
        stage: { name: 'Applied' },
      });
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(
        service.replaceStages('org-1', 'job-1', { stages: ['Screening'] }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(recruitmentStage.deleteMany).not.toHaveBeenCalled();
      expect(recruitmentStage.create).not.toHaveBeenCalled();
      expect(recruitmentStage.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a cross-tenant or nonexistent job, without touching stages', async () => {
      const { prisma, job, recruitmentStage } = createPrismaMock();
      job.findFirst.mockResolvedValue(null);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(
        service.replaceStages('org-1', 'job-1', { stages: ['Applied'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(recruitmentStage.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('applyTemplate', () => {
    it("copies the template's stages, ordered, into the job's own RecruitmentStage rows", async () => {
      const { prisma, job, recruitmentStage, application } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      recruitmentStage.findMany
        .mockResolvedValueOnce([]) // job has no stages yet
        .mockResolvedValueOnce([
          { id: 'stage-1', name: 'Applied', order: 0 },
          { id: 'stage-2', name: 'Interview', order: 1 },
        ]);
      application.findFirst.mockResolvedValue(null);
      const pipelineTemplatesService = createPipelineTemplatesServiceMock();
      (pipelineTemplatesService.getOne as jest.Mock).mockResolvedValue({
        id: 'template-1',
        organizationId: 'org-1',
        name: 'Standard Pipeline',
        stages: [
          { id: 's2', name: 'Interview', order: 1 },
          { id: 's1', name: 'Applied', order: 0 },
        ],
      });
      const service = new JobsService(prisma, pipelineTemplatesService);

      await service.applyTemplate('org-1', 'job-1', {
        pipelineTemplateId: 'template-1',
      });

      expect(pipelineTemplatesService.getOne).toHaveBeenCalledWith(
        'org-1',
        'template-1',
      );
      expect(recruitmentStage.create).toHaveBeenNthCalledWith(1, {
        data: { jobId: 'job-1', name: 'Applied', order: 0 },
      });
      expect(recruitmentStage.create).toHaveBeenNthCalledWith(2, {
        data: { jobId: 'job-1', name: 'Interview', order: 1 },
      });
    });

    it('converts a cross-tenant or nonexistent template into UnprocessableEntityException (docs/open-questions.md Q18)', async () => {
      const { prisma, job, recruitmentStage } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      const pipelineTemplatesService = createPipelineTemplatesServiceMock();
      (pipelineTemplatesService.getOne as jest.Mock).mockRejectedValue(
        new NotFoundException('Pipeline template not found.'),
      );
      const service = new JobsService(prisma, pipelineTemplatesService);

      await expect(
        service.applyTemplate('org-1', 'job-1', {
          pipelineTemplateId: 'template-1',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(recruitmentStage.deleteMany).not.toHaveBeenCalled();
      expect(recruitmentStage.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a cross-tenant or nonexistent job', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue(null);
      const pipelineTemplatesService = createPipelineTemplatesServiceMock();
      const service = new JobsService(prisma, pipelineTemplatesService);

      await expect(
        service.applyTemplate('org-1', 'job-1', {
          pipelineTemplateId: 'template-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(pipelineTemplatesService.getOne).not.toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('publishes a DRAFT job that has at least one stage', async () => {
      const { prisma, job, recruitmentStage } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      recruitmentStage.count.mockResolvedValue(1);
      job.update.mockResolvedValue({
        ...baseJob,
        status: 'PUBLISHED',
        publishedAt: new Date('2026-02-01'),
      });
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      const result = await service.publish('org-1', 'job-1');

      expect(job.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { status: 'PUBLISHED', publishedAt: expect.any(Date) as Date },
      });
      expect(result).toMatchObject({ status: 'PUBLISHED' });
    });

    it('throws UnprocessableEntityException if the job has no recruitment stages (docs/open-questions.md Q18)', async () => {
      const { prisma, job, recruitmentStage } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      recruitmentStage.count.mockResolvedValue(0);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(service.publish('org-1', 'job-1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(job.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException if the job is not DRAFT', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue({ ...baseJob, status: 'PUBLISHED' });
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(service.publish('org-1', 'job-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(job.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a cross-tenant or nonexistent job', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue(null);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(service.publish('org-1', 'job-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('close', () => {
    it('closes a PUBLISHED job', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue({ ...baseJob, status: 'PUBLISHED' });
      job.update.mockResolvedValue({
        ...baseJob,
        status: 'CLOSED',
        closedAt: new Date('2026-03-01'),
      });
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      const result = await service.close('org-1', 'job-1');

      expect(job.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { status: 'CLOSED', closedAt: expect.any(Date) as Date },
      });
      expect(result).toMatchObject({ status: 'CLOSED' });
    });

    it('throws ConflictException if the job is not PUBLISHED', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(service.close('org-1', 'job-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(job.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a cross-tenant or nonexistent job', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue(null);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(service.close('org-1', 'job-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('archive', () => {
    it('archives a job from any non-ARCHIVED status', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await service.archive('org-1', 'job-1');

      expect(job.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { status: 'ARCHIVED' },
      });
    });

    it('throws ConflictException if the job is already archived', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue({ ...baseJob, status: 'ARCHIVED' });
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(service.archive('org-1', 'job-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(job.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a cross-tenant or nonexistent job', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue(null);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(service.archive('org-1', 'job-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('search', () => {
    const publishedJob = {
      ...baseJob,
      status: 'PUBLISHED',
      publishedAt: new Date('2026-02-01'),
      organization: { id: 'org-1', name: 'Acme Recruiting' },
    };

    it('filters to PUBLISHED jobs at ACTIVE organizations, applying pagination', async () => {
      const { prisma, job } = createPrismaMock();
      job.findMany.mockResolvedValue([publishedJob]);
      job.count.mockResolvedValue(1);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      const result = await service.search({ page: 1, pageSize: 20 });

      expect(job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'PUBLISHED',
            organization: { status: 'ACTIVE' },
          },
        }),
      );
      expect(result.data).toEqual([
        {
          id: 'job-1',
          title: 'Software Engineer',
          description: 'Build things.',
          department: null,
          location: null,
          employmentType: null,
          salaryMin: null,
          salaryMax: null,
          publishedAt: publishedJob.publishedAt,
          organization: { id: 'org-1', name: 'Acme Recruiting' },
        },
      ]);
      expect(result.data[0]).not.toHaveProperty('createdById');
      expect(result.data[0]).not.toHaveProperty('status');
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('applies keyword/location/employmentType/organizationId filters when given', async () => {
      const { prisma, job } = createPrismaMock();
      job.findMany.mockResolvedValue([]);
      job.count.mockResolvedValue(0);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await service.search({
        keyword: 'engineer',
        location: 'remote',
        employmentType: 'FULL_TIME',
        organizationId: 'org-1',
        page: 1,
        pageSize: 20,
      });

      expect(job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'PUBLISHED',
            organization: { status: 'ACTIVE' },
            OR: [
              { title: { contains: 'engineer', mode: 'insensitive' } },
              { description: { contains: 'engineer', mode: 'insensitive' } },
            ],
            location: { contains: 'remote', mode: 'insensitive' },
            employmentType: 'FULL_TIME',
            organizationId: 'org-1',
          },
        }),
      );
    });
  });

  describe('getPublicOne', () => {
    it('returns a PUBLISHED job at an ACTIVE organization', async () => {
      const { prisma, job } = createPrismaMock();
      const publishedJob = {
        ...baseJob,
        status: 'PUBLISHED',
        organization: { id: 'org-1', name: 'Acme Recruiting' },
      };
      job.findFirst.mockResolvedValue(publishedJob);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      const result = await service.getPublicOne('job-1');

      expect(job.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'job-1',
          status: 'PUBLISHED',
          organization: { status: 'ACTIVE' },
        },
        include: { organization: { select: { id: true, name: true } } },
      });
      expect(result).toMatchObject({ id: 'job-1', title: 'Software Engineer' });
    });

    it('throws NotFoundException for a DRAFT/CLOSED/ARCHIVED job or one at a non-ACTIVE org', async () => {
      const { prisma, job } = createPrismaMock();
      job.findFirst.mockResolvedValue(null);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(service.getPublicOne('job-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
