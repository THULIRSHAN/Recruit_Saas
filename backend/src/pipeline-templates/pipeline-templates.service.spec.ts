import { NotFoundException } from '@nestjs/common';
import { PipelineTemplatesService } from './pipeline-templates.service';
import { PrismaService } from '../prisma/prisma.service';

function createPrismaMock() {
  const pipelineTemplate = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const txMock = {
    pipelineTemplate: {
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    pipelineStageTemplate: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const prisma = {
    pipelineTemplate,
    $transaction: jest.fn((callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    ),
  };
  return {
    prisma: prisma as unknown as PrismaService,
    pipelineTemplate,
    tx: txMock,
  };
}

const baseTemplate = {
  id: 'template-1',
  organizationId: 'org-1',
  name: 'Standard Pipeline',
  stages: [
    { id: 'stage-1', name: 'Applied', order: 0 },
    { id: 'stage-2', name: 'Interview', order: 1 },
  ],
};

describe('PipelineTemplatesService', () => {
  describe('create', () => {
    it('creates a template with ordered stages scoped to the caller org', async () => {
      const { prisma, pipelineTemplate } = createPrismaMock();
      pipelineTemplate.create.mockResolvedValue(baseTemplate);
      const service = new PipelineTemplatesService(prisma);

      const result = await service.create('org-1', {
        name: 'Standard Pipeline',
        stages: ['Applied', 'Interview'],
      });

      expect(pipelineTemplate.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          name: 'Standard Pipeline',
          stages: {
            create: [
              { name: 'Applied', order: 0 },
              { name: 'Interview', order: 1 },
            ],
          },
        },
        include: { stages: { orderBy: { order: 'asc' } } },
      });
      expect(result).toMatchObject({
        id: 'template-1',
        stages: [
          { name: 'Applied', order: 0 },
          { name: 'Interview', order: 1 },
        ],
      });
    });

    it('throws NotFoundException when the caller has no org in their token', async () => {
      const { prisma, pipelineTemplate } = createPrismaMock();
      const service = new PipelineTemplatesService(prisma);

      await expect(
        service.create(null, {
          name: 'Standard Pipeline',
          stages: ['Applied'],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(pipelineTemplate.create).not.toHaveBeenCalled();
    });
  });

  describe('getOne', () => {
    it('returns a template scoped to the caller org', async () => {
      const { prisma, pipelineTemplate } = createPrismaMock();
      pipelineTemplate.findFirst.mockResolvedValue(baseTemplate);
      const service = new PipelineTemplatesService(prisma);

      const result = await service.getOne('org-1', 'template-1');

      expect(pipelineTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: 'template-1', organizationId: 'org-1' },
        include: { stages: { orderBy: { order: 'asc' } } },
      });
      expect(result.id).toBe('template-1');
    });

    it('throws NotFoundException for a cross-tenant or nonexistent template', async () => {
      const { prisma, pipelineTemplate } = createPrismaMock();
      pipelineTemplate.findFirst.mockResolvedValue(null);
      const service = new PipelineTemplatesService(prisma);

      await expect(
        service.getOne('org-1', 'template-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('replaces the stage list wholesale when stages are provided', async () => {
      const { prisma, pipelineTemplate, tx } = createPrismaMock();
      pipelineTemplate.findFirst.mockResolvedValue(baseTemplate);
      tx.pipelineTemplate.findUniqueOrThrow.mockResolvedValue({
        ...baseTemplate,
        stages: [{ id: 'stage-3', name: 'Screening', order: 0 }],
      });
      const service = new PipelineTemplatesService(prisma);

      await service.update('org-1', 'template-1', { stages: ['Screening'] });

      expect(tx.pipelineStageTemplate.deleteMany).toHaveBeenCalledWith({
        where: { pipelineTemplateId: 'template-1' },
      });
      expect(tx.pipelineStageTemplate.createMany).toHaveBeenCalledWith({
        data: [
          { pipelineTemplateId: 'template-1', name: 'Screening', order: 0 },
        ],
      });
    });

    it('updates only the name when stages are not provided', async () => {
      const { prisma, pipelineTemplate, tx } = createPrismaMock();
      pipelineTemplate.findFirst.mockResolvedValue(baseTemplate);
      tx.pipelineTemplate.findUniqueOrThrow.mockResolvedValue(baseTemplate);
      const service = new PipelineTemplatesService(prisma);

      await service.update('org-1', 'template-1', { name: 'Renamed' });

      expect(tx.pipelineTemplate.update).toHaveBeenCalledWith({
        where: { id: 'template-1' },
        data: { name: 'Renamed' },
      });
      expect(tx.pipelineStageTemplate.deleteMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a cross-tenant or nonexistent template', async () => {
      const { prisma, pipelineTemplate } = createPrismaMock();
      pipelineTemplate.findFirst.mockResolvedValue(null);
      const service = new PipelineTemplatesService(prisma);

      await expect(
        service.update('org-1', 'template-1', { name: 'Renamed' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes a template scoped to the caller org', async () => {
      const { prisma, pipelineTemplate } = createPrismaMock();
      pipelineTemplate.findFirst.mockResolvedValue(baseTemplate);
      const service = new PipelineTemplatesService(prisma);

      await service.remove('org-1', 'template-1');

      expect(pipelineTemplate.delete).toHaveBeenCalledWith({
        where: { id: 'template-1' },
      });
    });

    it('throws NotFoundException for a cross-tenant or nonexistent template, without deleting', async () => {
      const { prisma, pipelineTemplate } = createPrismaMock();
      pipelineTemplate.findFirst.mockResolvedValue(null);
      const service = new PipelineTemplatesService(prisma);

      await expect(
        service.remove('org-1', 'template-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(pipelineTemplate.delete).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('scopes results to the caller org with pagination', async () => {
      const { prisma, pipelineTemplate } = createPrismaMock();
      pipelineTemplate.findMany.mockResolvedValue([baseTemplate]);
      pipelineTemplate.count.mockResolvedValue(1);
      const service = new PipelineTemplatesService(prisma);

      const result = await service.list('org-1', { page: 1, pageSize: 20 });

      expect(pipelineTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });
  });
});
