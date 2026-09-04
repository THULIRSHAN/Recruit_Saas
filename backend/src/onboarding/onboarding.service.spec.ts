import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationsService } from '../applications/applications.service';
import { Prisma } from '../generated/prisma/client';
import { OffersService } from '../offers/offers.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OnboardingService } from './onboarding.service';

function createPrismaMock() {
  const onboardingChecklist = { create: jest.fn(), findUnique: jest.fn() };
  const onboardingTask = {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const document = { create: jest.fn() };
  const prisma = { onboardingChecklist, onboardingTask, document };
  return {
    prisma: prisma as unknown as PrismaService,
    onboardingChecklist,
    onboardingTask,
    document,
  };
}

function createOffersServiceMock() {
  return {
    getForJob: jest.fn(),
    getMine: jest.fn(),
  } as unknown as jest.Mocked<OffersService>;
}

function createStorageServiceMock() {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<StorageService>;
}

const baseChecklist = {
  id: 'checklist-1',
  offerId: 'offer-1',
  createdAt: new Date('2026-01-01'),
  tasks: [
    {
      id: 'task-1',
      checklistId: 'checklist-1',
      name: 'Submit ID proof',
      required: true,
      completedAt: null,
      documents: [],
    },
  ],
};

describe('OnboardingService', () => {
  describe('createChecklist', () => {
    it('creates a checklist for an ACCEPTED offer (happy path)', async () => {
      const { prisma, onboardingChecklist } = createPrismaMock();
      const offersService = createOffersServiceMock();
      const storageService = createStorageServiceMock();
      offersService.getForJob.mockResolvedValue({
        id: 'offer-1',
        status: 'ACCEPTED',
      } as never);
      onboardingChecklist.create.mockResolvedValue(baseChecklist);
      const service = new OnboardingService(
        prisma,
        {} as ApplicationsService,
        offersService,
        storageService,
      );

      const result = await service.createChecklist('org-1', 'job-1', 'app-1', {
        tasks: [{ name: 'Submit ID proof' }],
      });

      expect(onboardingChecklist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            offerId: 'offer-1',
            tasks: {
              create: [{ name: 'Submit ID proof', required: true }],
            },
          }) as unknown,
        }),
      );
      expect(result.id).toBe('checklist-1');
    });

    it('throws ConflictException when the offer is not ACCEPTED', async () => {
      const { prisma } = createPrismaMock();
      const offersService = createOffersServiceMock();
      const storageService = createStorageServiceMock();
      offersService.getForJob.mockResolvedValue({
        id: 'offer-1',
        status: 'SENT',
      } as never);
      const service = new OnboardingService(
        prisma,
        {} as ApplicationsService,
        offersService,
        storageService,
      );

      await expect(
        service.createChecklist('org-1', 'job-1', 'app-1', {
          tasks: [{ name: 'Submit ID proof' }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException when onboarding was already started (P2002)', async () => {
      const { prisma, onboardingChecklist } = createPrismaMock();
      const offersService = createOffersServiceMock();
      const storageService = createStorageServiceMock();
      offersService.getForJob.mockResolvedValue({
        id: 'offer-1',
        status: 'ACCEPTED',
      } as never);
      onboardingChecklist.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const service = new OnboardingService(
        prisma,
        {} as ApplicationsService,
        offersService,
        storageService,
      );

      await expect(
        service.createChecklist('org-1', 'job-1', 'app-1', {
          tasks: [{ name: 'Submit ID proof' }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('getForJob', () => {
    it('returns the checklist scoped to the offer', async () => {
      const { prisma, onboardingChecklist } = createPrismaMock();
      const offersService = createOffersServiceMock();
      const storageService = createStorageServiceMock();
      offersService.getForJob.mockResolvedValue({ id: 'offer-1' } as never);
      onboardingChecklist.findUnique.mockResolvedValue(baseChecklist);
      const service = new OnboardingService(
        prisma,
        {} as ApplicationsService,
        offersService,
        storageService,
      );

      const result = await service.getForJob('org-1', 'job-1', 'app-1');

      expect(onboardingChecklist.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { offerId: 'offer-1' } }),
      );
      expect(result.tasks[0].name).toBe('Submit ID proof');
    });

    it('throws NotFoundException when onboarding has not been started', async () => {
      const { prisma, onboardingChecklist } = createPrismaMock();
      const offersService = createOffersServiceMock();
      const storageService = createStorageServiceMock();
      offersService.getForJob.mockResolvedValue({ id: 'offer-1' } as never);
      onboardingChecklist.findUnique.mockResolvedValue(null);
      const service = new OnboardingService(
        prisma,
        {} as ApplicationsService,
        offersService,
        storageService,
      );

      await expect(
        service.getForJob('org-1', 'job-1', 'app-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('completeTask', () => {
    it('marks a task complete', async () => {
      const { prisma, onboardingChecklist, onboardingTask } =
        createPrismaMock();
      const offersService = createOffersServiceMock();
      const storageService = createStorageServiceMock();
      offersService.getForJob.mockResolvedValue({ id: 'offer-1' } as never);
      onboardingChecklist.findUnique.mockResolvedValue(baseChecklist);
      onboardingTask.findFirst.mockResolvedValue(baseChecklist.tasks[0]);
      const service = new OnboardingService(
        prisma,
        {} as ApplicationsService,
        offersService,
        storageService,
      );

      await service.completeTask('org-1', 'job-1', 'app-1', 'task-1');

      expect(onboardingTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({
            completedAt: expect.any(Date) as Date,
          }) as unknown,
        }),
      );
    });

    it('throws NotFoundException for a task outside this checklist', async () => {
      const { prisma, onboardingChecklist, onboardingTask } =
        createPrismaMock();
      const offersService = createOffersServiceMock();
      const storageService = createStorageServiceMock();
      offersService.getForJob.mockResolvedValue({ id: 'offer-1' } as never);
      onboardingChecklist.findUnique.mockResolvedValue(baseChecklist);
      onboardingTask.findFirst.mockResolvedValue(null);
      const service = new OnboardingService(
        prisma,
        {} as ApplicationsService,
        offersService,
        storageService,
      );

      await expect(
        service.completeTask('org-1', 'job-1', 'app-1', 'task-999'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('uploadDocument', () => {
    const file = {
      buffer: Buffer.from('file contents'),
      originalname: 'id-proof.pdf',
      size: 1024,
    } as Express.Multer.File;

    it('uploads a document for a valid task (happy path)', async () => {
      const { prisma, onboardingChecklist, onboardingTask, document } =
        createPrismaMock();
      const offersService = createOffersServiceMock();
      const storageService = createStorageServiceMock();
      offersService.getMine.mockResolvedValue({ id: 'offer-1' } as never);
      onboardingChecklist.findUnique.mockResolvedValue(baseChecklist);
      onboardingTask.findFirst.mockResolvedValue(baseChecklist.tasks[0]);
      storageService.upload.mockResolvedValue({ key: 'documents/abc123' });
      document.create.mockResolvedValue({
        id: 'doc-1',
        fileName: 'id-proof.pdf',
        uploadedAt: new Date('2026-01-02'),
      });
      const service = new OnboardingService(
        prisma,
        {} as ApplicationsService,
        offersService,
        storageService,
      );

      const result = await service.uploadDocument(
        'candidate-1',
        'app-1',
        'task-1',
        file,
      );

      expect(storageService.upload).toHaveBeenCalledWith(
        file.buffer,
        'id-proof.pdf',
      );
      expect(document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            taskId: 'task-1',
            uploadedById: 'candidate-1',
            fileKey: 'documents/abc123',
          }) as unknown,
        }),
      );
      expect(result.id).toBe('doc-1');
    });

    it('throws BadRequestException when no file is provided', async () => {
      const { prisma } = createPrismaMock();
      const offersService = createOffersServiceMock();
      const storageService = createStorageServiceMock();
      const service = new OnboardingService(
        prisma,
        {} as ApplicationsService,
        offersService,
        storageService,
      );

      await expect(
        service.uploadDocument('candidate-1', 'app-1', 'task-1', undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when the file exceeds the size limit', async () => {
      const { prisma } = createPrismaMock();
      const offersService = createOffersServiceMock();
      const storageService = createStorageServiceMock();
      const service = new OnboardingService(
        prisma,
        {} as ApplicationsService,
        offersService,
        storageService,
      );

      await expect(
        service.uploadDocument('candidate-1', 'app-1', 'task-1', {
          ...file,
          size: 10 * 1024 * 1024,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("throws NotFoundException for a task outside the candidate's checklist", async () => {
      const { prisma, onboardingChecklist, onboardingTask } =
        createPrismaMock();
      const offersService = createOffersServiceMock();
      const storageService = createStorageServiceMock();
      offersService.getMine.mockResolvedValue({ id: 'offer-1' } as never);
      onboardingChecklist.findUnique.mockResolvedValue(baseChecklist);
      onboardingTask.findFirst.mockResolvedValue(null);
      const service = new OnboardingService(
        prisma,
        {} as ApplicationsService,
        offersService,
        storageService,
      );

      await expect(
        service.uploadDocument('candidate-1', 'app-1', 'task-999', file),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("propagates NotFoundException for another candidate's application", async () => {
      const { prisma } = createPrismaMock();
      const offersService = createOffersServiceMock();
      const storageService = createStorageServiceMock();
      offersService.getMine.mockRejectedValue(
        new NotFoundException('Application not found.'),
      );
      const service = new OnboardingService(
        prisma,
        {} as ApplicationsService,
        offersService,
        storageService,
      );

      await expect(
        service.uploadDocument('candidate-1', 'app-1', 'task-1', file),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
