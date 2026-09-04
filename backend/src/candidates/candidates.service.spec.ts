import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

function createStorageServiceMock() {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn(),
    delete: jest.fn(),
  } as unknown as StorageService;
}

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
  const cV = {
    count: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  };
  const txMock = { education, experience, skill };
  const prisma = {
    candidateProfile,
    education,
    experience,
    skill,
    cV,
    $transaction: jest.fn(
      (arg: ((tx: typeof txMock) => unknown) | Promise<unknown>[]) =>
        typeof arg === 'function' ? arg(txMock) : Promise.all(arg),
    ),
  };
  return {
    prisma: prisma as unknown as PrismaService,
    candidateProfile,
    education,
    experience,
    skill,
    cV,
  };
}

describe('CandidatesService', () => {
  describe('getMine', () => {
    it('returns a synthesized empty profile when none exists yet, without creating one', async () => {
      const { prisma, candidateProfile } = createPrismaMock();
      candidateProfile.findUnique.mockResolvedValue(null);
      const service = new CandidatesService(prisma, createStorageServiceMock());

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
      const service = new CandidatesService(prisma, createStorageServiceMock());

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
      const service = new CandidatesService(prisma, createStorageServiceMock());

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
      const service = new CandidatesService(prisma, createStorageServiceMock());

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
      const service = new CandidatesService(prisma, createStorageServiceMock());

      await service.replaceEducation('user-1', { education: [] });

      expect(education.deleteMany).toHaveBeenCalled();
      expect(education.createMany).not.toHaveBeenCalled();
    });
  });

  describe('replaceExperience', () => {
    it('converts date strings to Date objects', async () => {
      const { prisma, experience } = createPrismaMock();
      experience.findMany.mockResolvedValue([]);
      const service = new CandidatesService(prisma, createStorageServiceMock());

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
      const service = new CandidatesService(prisma, createStorageServiceMock());

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

  describe('uploadCv', () => {
    const pdfBuffer = Buffer.from('%PDF-1.4\n%mock pdf contents');

    function makeFile(overrides: Partial<Express.Multer.File> = {}) {
      return {
        buffer: pdfBuffer,
        size: pdfBuffer.length,
        originalname: 'resume.pdf',
        mimetype: 'application/pdf',
        ...overrides,
      } as Express.Multer.File;
    }

    it('uploads a valid PDF and marks it primary when it is the first CV', async () => {
      const { prisma, candidateProfile, cV } = createPrismaMock();
      cV.count.mockResolvedValue(0);
      cV.create.mockResolvedValue({
        id: 'cv-1',
        fileName: 'resume.pdf',
        isPrimary: true,
        uploadedAt: new Date('2026-01-01'),
      });
      const storageService = createStorageServiceMock();
      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'abc123.pdf',
      });
      const service = new CandidatesService(prisma, storageService);

      const result = await service.uploadCv('user-1', makeFile());

      expect(candidateProfile.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        create: { userId: 'user-1' },
        update: {},
      });
      expect(storageService.upload).toHaveBeenCalledWith(
        pdfBuffer,
        'resume.pdf',
      );
      expect(cV.create).toHaveBeenCalledWith({
        data: {
          candidateId: 'user-1',
          fileKey: 'abc123.pdf',
          fileName: 'resume.pdf',
          isPrimary: true,
        },
      });
      expect(result).toMatchObject({ id: 'cv-1', isPrimary: true });
    });

    it('does not mark a second CV as primary', async () => {
      const { prisma, cV } = createPrismaMock();
      cV.count.mockResolvedValue(1);
      cV.create.mockResolvedValue({
        id: 'cv-2',
        fileName: 'resume.pdf',
        isPrimary: false,
        uploadedAt: new Date('2026-01-01'),
      });
      const storageService = createStorageServiceMock();
      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'def456.pdf',
      });
      const service = new CandidatesService(prisma, storageService);

      await service.uploadCv('user-1', makeFile());

      expect(cV.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isPrimary: false }),
        }),
      );
    });

    it('throws BadRequestException when no file is provided', async () => {
      const { prisma } = createPrismaMock();
      const service = new CandidatesService(prisma, createStorageServiceMock());

      await expect(
        service.uploadCv('user-1', undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException for a file exceeding the 5MB limit', async () => {
      const { prisma } = createPrismaMock();
      const service = new CandidatesService(prisma, createStorageServiceMock());

      await expect(
        service.uploadCv('user-1', makeFile({ size: 6 * 1024 * 1024 })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException for content that does not match an allowed file signature', async () => {
      const { prisma } = createPrismaMock();
      const service = new CandidatesService(prisma, createStorageServiceMock());
      const fakeFile = makeFile({
        buffer: Buffer.from('this is not a real pdf'),
        originalname: 'resume.pdf',
      });

      await expect(
        service.uploadCv('user-1', {
          ...fakeFile,
          size: fakeFile.buffer.length,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('setPrimaryCv', () => {
    it('unsets any other primary CV and sets the requested one, scoped to the caller', async () => {
      const { prisma, cV } = createPrismaMock();
      cV.findFirst.mockResolvedValue({ id: 'cv-1', candidateId: 'user-1' });
      cV.update.mockResolvedValue({
        id: 'cv-1',
        fileName: 'resume.pdf',
        isPrimary: true,
        uploadedAt: new Date('2026-01-01'),
      });
      const service = new CandidatesService(prisma, createStorageServiceMock());

      const result = await service.setPrimaryCv('user-1', 'cv-1');

      expect(cV.findFirst).toHaveBeenCalledWith({
        where: { id: 'cv-1', candidateId: 'user-1' },
      });
      expect(cV.updateMany).toHaveBeenCalledWith({
        where: { candidateId: 'user-1', id: { not: 'cv-1' } },
        data: { isPrimary: false },
      });
      expect(cV.update).toHaveBeenCalledWith({
        where: { id: 'cv-1' },
        data: { isPrimary: true },
      });
      expect(result.isPrimary).toBe(true);
    });

    it('throws NotFoundException for a CV that does not belong to the caller', async () => {
      const { prisma, cV } = createPrismaMock();
      cV.findFirst.mockResolvedValue(null);
      const service = new CandidatesService(prisma, createStorageServiceMock());

      await expect(
        service.setPrimaryCv('user-1', 'cv-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(cV.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteCv', () => {
    it('deletes the DB row then the stored file, scoped to the caller', async () => {
      const { prisma, cV } = createPrismaMock();
      cV.findFirst.mockResolvedValue({
        id: 'cv-1',
        candidateId: 'user-1',
        fileKey: 'abc123.pdf',
      });
      const storageService = createStorageServiceMock();
      const service = new CandidatesService(prisma, storageService);

      await service.deleteCv('user-1', 'cv-1');

      expect(cV.delete).toHaveBeenCalledWith({ where: { id: 'cv-1' } });
      expect(storageService.delete).toHaveBeenCalledWith('abc123.pdf');
    });

    it('throws NotFoundException for a CV that does not belong to the caller, without deleting anything', async () => {
      const { prisma, cV } = createPrismaMock();
      cV.findFirst.mockResolvedValue(null);
      const storageService = createStorageServiceMock();
      const service = new CandidatesService(prisma, storageService);

      await expect(service.deleteCv('user-1', 'cv-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(cV.delete).not.toHaveBeenCalled();
      expect(storageService.delete).not.toHaveBeenCalled();
    });
  });

  describe('getCvSignedUrl', () => {
    it('returns a signed url for a CV owned by the caller', async () => {
      const { prisma, cV } = createPrismaMock();
      cV.findFirst.mockResolvedValue({
        id: 'cv-1',
        candidateId: 'user-1',
        fileKey: 'abc123.pdf',
      });
      const storageService = createStorageServiceMock();
      const expiresAt = new Date('2026-01-01T00:15:00Z');
      (storageService.getSignedUrl as jest.Mock).mockResolvedValue({
        url: '/api/v1/storage/abc123.pdf?expires=1&signature=sig',
        expiresAt,
      });
      const service = new CandidatesService(prisma, storageService);

      const result = await service.getCvSignedUrl('user-1', 'cv-1');

      expect(storageService.getSignedUrl).toHaveBeenCalledWith('abc123.pdf');
      expect(result).toEqual({
        url: '/api/v1/storage/abc123.pdf?expires=1&signature=sig',
        expiresAt,
      });
    });

    it('throws NotFoundException for a CV that does not belong to the caller', async () => {
      const { prisma } = createPrismaMock();
      const service = new CandidatesService(prisma, createStorageServiceMock());

      await expect(
        service.getCvSignedUrl('user-1', 'cv-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
