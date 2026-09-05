import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UniversitiesService } from './universities.service';

function createPrismaMock() {
  const university = {
    findMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
  };
  const universityPartnership = {
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  };
  const prisma = { university, universityPartnership };
  return {
    prisma: prisma as unknown as PrismaService,
    university,
    universityPartnership,
  };
}

const baseUniversity = { id: 'uni-1', name: 'State University' };
const basePartnership = {
  id: 'partnership-1',
  organizationId: 'org-1',
  universityId: 'uni-1',
  startedAt: new Date('2026-01-01'),
  university: baseUniversity,
};

describe('UniversitiesService', () => {
  describe('list', () => {
    it('returns the university catalog', async () => {
      const { prisma, university } = createPrismaMock();
      university.findMany.mockResolvedValue([baseUniversity]);
      const service = new UniversitiesService(prisma);

      const result = await service.list();

      expect(result).toEqual([{ id: 'uni-1', name: 'State University' }]);
    });
  });

  describe('create', () => {
    it('creates a university (happy path)', async () => {
      const { prisma, university } = createPrismaMock();
      university.create.mockResolvedValue(baseUniversity);
      const service = new UniversitiesService(prisma);

      const result = await service.create({ name: 'State University' });

      expect(result).toEqual({ id: 'uni-1', name: 'State University' });
    });

    it('throws ConflictException on a duplicate name (P2002)', async () => {
      const { prisma, university } = createPrismaMock();
      university.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const service = new UniversitiesService(prisma);

      await expect(
        service.create({ name: 'State University' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listPartnerships', () => {
    it("returns the org's partnerships", async () => {
      const { prisma, universityPartnership } = createPrismaMock();
      universityPartnership.findMany.mockResolvedValue([basePartnership]);
      const service = new UniversitiesService(prisma);

      const result = await service.listPartnerships('org-1');

      expect(universityPartnership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
      expect(result[0].university.name).toBe('State University');
    });

    it('throws NotFoundException when there is no organization in session context', async () => {
      const { prisma } = createPrismaMock();
      const service = new UniversitiesService(prisma);

      await expect(service.listPartnerships(null)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createPartnership', () => {
    it('creates a partnership for an existing university (happy path)', async () => {
      const { prisma, university, universityPartnership } = createPrismaMock();
      university.findUnique.mockResolvedValue(baseUniversity);
      universityPartnership.create.mockResolvedValue(basePartnership);
      const service = new UniversitiesService(prisma);

      const result = await service.createPartnership('org-1', {
        universityId: 'uni-1',
      });

      expect(universityPartnership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { organizationId: 'org-1', universityId: 'uni-1' },
        }),
      );
      expect(result.university.id).toBe('uni-1');
    });

    it('throws UnprocessableEntityException for a nonexistent universityId', async () => {
      const { prisma, university } = createPrismaMock();
      university.findUnique.mockResolvedValue(null);
      const service = new UniversitiesService(prisma);

      await expect(
        service.createPartnership('org-1', { universityId: 'bad-id' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws ConflictException on a duplicate partnership (P2002)', async () => {
      const { prisma, university, universityPartnership } = createPrismaMock();
      university.findUnique.mockResolvedValue(baseUniversity);
      universityPartnership.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const service = new UniversitiesService(prisma);

      await expect(
        service.createPartnership('org-1', { universityId: 'uni-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('removePartnership', () => {
    it('removes an existing partnership', async () => {
      const { prisma, universityPartnership } = createPrismaMock();
      universityPartnership.deleteMany.mockResolvedValue({ count: 1 });
      const service = new UniversitiesService(prisma);

      await service.removePartnership('org-1', 'uni-1');

      expect(universityPartnership.deleteMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', universityId: 'uni-1' },
      });
    });

    it('throws NotFoundException when no partnership exists', async () => {
      const { prisma, universityPartnership } = createPrismaMock();
      universityPartnership.deleteMany.mockResolvedValue({ count: 0 });
      const service = new UniversitiesService(prisma);

      await expect(
        service.removePartnership('org-1', 'uni-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
