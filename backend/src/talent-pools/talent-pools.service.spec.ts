import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TalentPoolsService } from './talent-pools.service';

function createPrismaMock() {
  const talentPool = {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  };
  const talentPoolCandidate = { create: jest.fn(), deleteMany: jest.fn() };
  const application = { findFirst: jest.fn() };
  const user = { findMany: jest.fn() };
  const prisma = { talentPool, talentPoolCandidate, application, user };
  return {
    prisma: prisma as unknown as PrismaService,
    talentPool,
    talentPoolCandidate,
    application,
    user,
  };
}

const basePool = {
  id: 'pool-1',
  organizationId: 'org-1',
  name: 'Strong Bench',
};
const baseMember = {
  talentPoolId: 'pool-1',
  candidateId: 'cand-1',
  addedAt: new Date('2026-01-01'),
};
const baseCandidateUser = {
  id: 'cand-1',
  fullName: 'Jane Candidate',
  email: 'jane@example.com',
};

describe('TalentPoolsService', () => {
  describe('create', () => {
    it('creates a pool with no candidates', async () => {
      const { prisma, talentPool } = createPrismaMock();
      talentPool.create.mockResolvedValue(basePool);
      const service = new TalentPoolsService(prisma);

      const result = await service.create('org-1', { name: 'Strong Bench' });

      expect(talentPool.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', name: 'Strong Bench' },
      });
      expect(result).toEqual({
        id: 'pool-1',
        name: 'Strong Bench',
        candidates: [],
      });
    });

    it('throws NotFoundException when there is no organization in session context', async () => {
      const { prisma } = createPrismaMock();
      const service = new TalentPoolsService(prisma);

      await expect(
        service.create(null, { name: 'Strong Bench' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getOne', () => {
    it('returns a pool with enriched candidate identities', async () => {
      const { prisma, talentPool, user } = createPrismaMock();
      talentPool.findFirst.mockResolvedValue({
        ...basePool,
        candidates: [baseMember],
      });
      user.findMany.mockResolvedValue([baseCandidateUser]);
      const service = new TalentPoolsService(prisma);

      const result = await service.getOne('org-1', 'pool-1');

      expect(talentPool.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pool-1', organizationId: 'org-1' },
        }),
      );
      expect(result.candidates[0]).toMatchObject({
        id: 'cand-1',
        fullName: 'Jane Candidate',
        email: 'jane@example.com',
      });
    });

    it('throws NotFoundException for a pool outside this org', async () => {
      const { prisma, talentPool } = createPrismaMock();
      talentPool.findFirst.mockResolvedValue(null);
      const service = new TalentPoolsService(prisma);

      await expect(service.getOne('org-1', 'pool-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('addCandidate', () => {
    it('tags a candidate who has applied to this org (happy path)', async () => {
      const { prisma, talentPool, talentPoolCandidate, application, user } =
        createPrismaMock();
      talentPool.findFirst.mockResolvedValue({
        ...basePool,
        candidates: [baseMember],
      });
      application.findFirst.mockResolvedValue({ id: 'app-1' });
      user.findMany.mockResolvedValue([baseCandidateUser]);
      const service = new TalentPoolsService(prisma);

      await service.addCandidate('org-1', 'pool-1', { candidateId: 'cand-1' });

      expect(application.findFirst).toHaveBeenCalledWith({
        where: { candidateId: 'cand-1', organizationId: 'org-1' },
      });
      expect(talentPoolCandidate.create).toHaveBeenCalledWith({
        data: { talentPoolId: 'pool-1', candidateId: 'cand-1' },
      });
    });

    it('throws UnprocessableEntityException when the candidate has never applied to this org', async () => {
      const { prisma, talentPool, application } = createPrismaMock();
      talentPool.findFirst.mockResolvedValue({ ...basePool, candidates: [] });
      application.findFirst.mockResolvedValue(null);
      const service = new TalentPoolsService(prisma);

      await expect(
        service.addCandidate('org-1', 'pool-1', { candidateId: 'outsider-1' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws ConflictException when the candidate is already tagged (P2002)', async () => {
      const { prisma, talentPool, talentPoolCandidate, application } =
        createPrismaMock();
      talentPool.findFirst.mockResolvedValue({ ...basePool, candidates: [] });
      application.findFirst.mockResolvedValue({ id: 'app-1' });
      talentPoolCandidate.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const service = new TalentPoolsService(prisma);

      await expect(
        service.addCandidate('org-1', 'pool-1', { candidateId: 'cand-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException for a pool outside this org', async () => {
      const { prisma, talentPool } = createPrismaMock();
      talentPool.findFirst.mockResolvedValue(null);
      const service = new TalentPoolsService(prisma);

      await expect(
        service.addCandidate('org-1', 'pool-1', { candidateId: 'cand-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removeCandidate', () => {
    it('untags a candidate', async () => {
      const { prisma, talentPool, talentPoolCandidate } = createPrismaMock();
      talentPool.findFirst.mockResolvedValue({ ...basePool, candidates: [] });
      talentPoolCandidate.deleteMany.mockResolvedValue({ count: 1 });
      const service = new TalentPoolsService(prisma);

      await service.removeCandidate('org-1', 'pool-1', 'cand-1');

      expect(talentPoolCandidate.deleteMany).toHaveBeenCalledWith({
        where: { talentPoolId: 'pool-1', candidateId: 'cand-1' },
      });
    });

    it('throws NotFoundException when the candidate is not in the pool', async () => {
      const { prisma, talentPool, talentPoolCandidate } = createPrismaMock();
      talentPool.findFirst.mockResolvedValue({ ...basePool, candidates: [] });
      talentPoolCandidate.deleteMany.mockResolvedValue({ count: 0 });
      const service = new TalentPoolsService(prisma);

      await expect(
        service.removeCandidate('org-1', 'pool-1', 'cand-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
