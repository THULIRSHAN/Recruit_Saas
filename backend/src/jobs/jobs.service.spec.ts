import {
  BadRequestException,
  ConflictException,
  NotFoundException,
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
    count: jest.fn(),
  };
  const txMock = { recruitmentStage };
  const prisma = {
    job,
    recruitmentStage,
    $transaction: jest.fn((callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    ),
  };
  return { prisma: prisma as unknown as PrismaService, job, recruitmentStage };
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
    it('replaces the stage list wholesale for a job scoped to the caller org', async () => {
      const { prisma, job, recruitmentStage } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      recruitmentStage.findMany.mockResolvedValue([
        { id: 'stage-1', name: 'Applied', order: 0 },
        { id: 'stage-2', name: 'Interview', order: 1 },
      ]);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      const result = await service.replaceStages('org-1', 'job-1', {
        stages: ['Applied', 'Interview'],
      });

      expect(recruitmentStage.deleteMany).toHaveBeenCalledWith({
        where: { jobId: 'job-1' },
      });
      expect(recruitmentStage.createMany).toHaveBeenCalledWith({
        data: [
          { jobId: 'job-1', name: 'Applied', order: 0 },
          { jobId: 'job-1', name: 'Interview', order: 1 },
        ],
      });
      expect(result).toEqual([
        { id: 'stage-1', name: 'Applied', order: 0 },
        { id: 'stage-2', name: 'Interview', order: 1 },
      ]);
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
      const { prisma, job, recruitmentStage } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      recruitmentStage.findMany.mockResolvedValue([
        { id: 'stage-1', name: 'Applied', order: 0 },
        { id: 'stage-2', name: 'Interview', order: 1 },
      ]);
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
      expect(recruitmentStage.createMany).toHaveBeenCalledWith({
        data: [
          { jobId: 'job-1', name: 'Applied', order: 0 },
          { jobId: 'job-1', name: 'Interview', order: 1 },
        ],
      });
    });

    it('propagates NotFoundException from a cross-tenant or nonexistent template', async () => {
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
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(recruitmentStage.deleteMany).not.toHaveBeenCalled();
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

    it('throws ConflictException if the job has no recruitment stages', async () => {
      const { prisma, job, recruitmentStage } = createPrismaMock();
      job.findFirst.mockResolvedValue(baseJob);
      recruitmentStage.count.mockResolvedValue(0);
      const service = new JobsService(
        prisma,
        createPipelineTemplatesServiceMock(),
      );

      await expect(service.publish('org-1', 'job-1')).rejects.toBeInstanceOf(
        ConflictException,
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
});
