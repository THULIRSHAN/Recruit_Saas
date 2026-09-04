import { CandidatesService } from './candidates.service';
import { PrismaService } from '../prisma/prisma.service';

function createPrismaMock() {
  const candidateProfile = { findUnique: jest.fn(), upsert: jest.fn() };
  const education = {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  };
  const experience = {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  };
  const skill = {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  };
  const txMock = { education, experience, skill };
  const prisma = {
    candidateProfile,
    education,
    experience,
    skill,
    $transaction: jest.fn((callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    ),
  };
  return {
    prisma: prisma as unknown as PrismaService,
    candidateProfile,
    education,
    experience,
    skill,
  };
}

describe('CandidatesService', () => {
  describe('getMine', () => {
    it('returns a synthesized empty profile when none exists yet, without creating one', async () => {
      const { prisma, candidateProfile } = createPrismaMock();
      candidateProfile.findUnique.mockResolvedValue(null);
      const service = new CandidatesService(prisma);

      const result = await service.getMine('user-1');

      expect(result).toEqual({
        headline: null,
        location: null,
        phone: null,
        education: [],
        experience: [],
        skills: [],
        cvs: [],
      });
      expect(candidateProfile.upsert).not.toHaveBeenCalled();
    });

    it('returns the existing profile with its nested lists', async () => {
      const { prisma, candidateProfile } = createPrismaMock();
      candidateProfile.findUnique.mockResolvedValue({
        headline: 'Software Engineer',
        location: 'Remote',
        phone: '555-1234',
        education: [
          {
            id: 'edu-1',
            institution: 'MIT',
            degree: null,
            startYear: 2018,
            endYear: 2022,
          },
        ],
        experience: [],
        skills: [{ id: 'skill-1', name: 'TypeScript' }],
        cvs: [
          {
            id: 'cv-1',
            fileName: 'resume.pdf',
            isPrimary: true,
            uploadedAt: new Date('2026-01-01'),
          },
        ],
      });
      const service = new CandidatesService(prisma);

      const result = await service.getMine('user-1');

      expect(result.headline).toBe('Software Engineer');
      expect(result.education).toEqual([
        {
          id: 'edu-1',
          institution: 'MIT',
          degree: null,
          startYear: 2018,
          endYear: 2022,
        },
      ]);
      expect(result.skills).toEqual([{ id: 'skill-1', name: 'TypeScript' }]);
      expect(result.cvs).toEqual([
        {
          id: 'cv-1',
          fileName: 'resume.pdf',
          isPrimary: true,
          uploadedAt: new Date('2026-01-01'),
        },
      ]);
    });
  });

  describe('updateMine', () => {
    it('upserts the profile with only the provided fields', async () => {
      const { prisma, candidateProfile } = createPrismaMock();
      candidateProfile.upsert.mockResolvedValue({
        headline: 'New Headline',
        location: null,
        phone: null,
        education: [],
        experience: [],
        skills: [],
        cvs: [],
      });
      const service = new CandidatesService(prisma);

      const result = await service.updateMine('user-1', {
        headline: 'New Headline',
      });

      expect(candidateProfile.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        create: {
          userId: 'user-1',
          headline: 'New Headline',
          location: undefined,
          phone: undefined,
        },
        update: { headline: 'New Headline' },
        include: { education: true, experience: true, skills: true, cvs: true },
      });
      expect(result.headline).toBe('New Headline');
    });
  });

  describe('replaceEducation', () => {
    it('creates the profile lazily, then replaces the education list wholesale', async () => {
      const { prisma, candidateProfile, education } = createPrismaMock();
      education.findMany.mockResolvedValue([
        {
          id: 'edu-1',
          institution: 'MIT',
          degree: null,
          startYear: 2018,
          endYear: 2022,
        },
      ]);
      const service = new CandidatesService(prisma);

      const result = await service.replaceEducation('user-1', {
        education: [{ institution: 'MIT', startYear: 2018, endYear: 2022 }],
      });

      expect(candidateProfile.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        create: { userId: 'user-1' },
        update: {},
      });
      expect(education.deleteMany).toHaveBeenCalledWith({
        where: { candidateId: 'user-1' },
      });
      expect(education.createMany).toHaveBeenCalledWith({
        data: [
          {
            candidateId: 'user-1',
            institution: 'MIT',
            degree: undefined,
            startYear: 2018,
            endYear: 2022,
          },
        ],
      });
      expect(result).toEqual([
        {
          id: 'edu-1',
          institution: 'MIT',
          degree: null,
          startYear: 2018,
          endYear: 2022,
        },
      ]);
    });

    it('clears the education list without calling createMany when given an empty array', async () => {
      const { prisma, education } = createPrismaMock();
      education.findMany.mockResolvedValue([]);
      const service = new CandidatesService(prisma);

      await service.replaceEducation('user-1', { education: [] });

      expect(education.deleteMany).toHaveBeenCalled();
      expect(education.createMany).not.toHaveBeenCalled();
    });
  });

  describe('replaceExperience', () => {
    it('converts date strings to Date objects', async () => {
      const { prisma, experience } = createPrismaMock();
      experience.findMany.mockResolvedValue([]);
      const service = new CandidatesService(prisma);

      await service.replaceExperience('user-1', {
        experience: [
          {
            company: 'Acme',
            title: 'Engineer',
            startDate: '2020-01-01',
            endDate: '2022-01-01',
          },
        ],
      });

      expect(experience.createMany).toHaveBeenCalledWith({
        data: [
          {
            candidateId: 'user-1',
            company: 'Acme',
            title: 'Engineer',
            startDate: new Date('2020-01-01'),
            endDate: new Date('2022-01-01'),
            description: undefined,
          },
        ],
      });
    });
  });

  describe('replaceSkills', () => {
    it('replaces the skills list wholesale', async () => {
      const { prisma, skill } = createPrismaMock();
      skill.findMany.mockResolvedValue([{ id: 'skill-1', name: 'TypeScript' }]);
      const service = new CandidatesService(prisma);

      const result = await service.replaceSkills('user-1', {
        skills: ['TypeScript'],
      });

      expect(skill.deleteMany).toHaveBeenCalledWith({
        where: { candidateId: 'user-1' },
      });
      expect(skill.createMany).toHaveBeenCalledWith({
        data: [{ candidateId: 'user-1', name: 'TypeScript' }],
      });
      expect(result).toEqual([{ id: 'skill-1', name: 'TypeScript' }]);
    });
  });
});
