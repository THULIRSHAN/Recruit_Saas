import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationsService } from '../applications/applications.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OffersService } from './offers.service';

function createPrismaMock() {
  const offer = {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { offer };
  return { prisma: prisma as unknown as PrismaService, offer };
}

function createApplicationsServiceMock() {
  return {
    getForJob: jest.fn(),
    getMine: jest.fn(),
  } as unknown as jest.Mocked<ApplicationsService>;
}

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

const baseOffer = {
  id: 'offer-1',
  applicationId: 'app-1',
  organizationId: 'org-1',
  title: 'Software Engineer',
  compensation: '100000',
  startDate: null,
  expiresAt: futureDate,
  status: 'SENT',
  sentAt: new Date('2026-01-01'),
  respondedAt: null,
};

describe('OffersService', () => {
  describe('create', () => {
    it('creates an offer for a HIRED application (happy path)', async () => {
      const { prisma, offer } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockResolvedValue({
        id: 'app-1',
        status: 'HIRED',
      } as never);
      offer.create.mockResolvedValue(baseOffer);
      const service = new OffersService(prisma, applicationsService);

      const result = await service.create('org-1', 'job-1', 'app-1', {
        title: 'Software Engineer',
        compensation: '100000',
        expiresAt: futureDate.toISOString(),
      });

      expect(offer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            applicationId: 'app-1',
            organizationId: 'org-1',
            title: 'Software Engineer',
          }) as unknown,
        }),
      );
      expect(result.id).toBe('offer-1');
    });

    it('throws ConflictException when the application is not HIRED', async () => {
      const { prisma } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockResolvedValue({
        id: 'app-1',
        status: 'ACTIVE',
      } as never);
      const service = new OffersService(prisma, applicationsService);

      await expect(
        service.create('org-1', 'job-1', 'app-1', {
          title: 'Software Engineer',
          expiresAt: futureDate.toISOString(),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws BadRequestException when expiresAt is not in the future', async () => {
      const { prisma } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockResolvedValue({
        id: 'app-1',
        status: 'HIRED',
      } as never);
      const service = new OffersService(prisma, applicationsService);

      await expect(
        service.create('org-1', 'job-1', 'app-1', {
          title: 'Software Engineer',
          expiresAt: pastDate.toISOString(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException when an offer already exists (P2002)', async () => {
      const { prisma, offer } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockResolvedValue({
        id: 'app-1',
        status: 'HIRED',
      } as never);
      offer.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const service = new OffersService(prisma, applicationsService);

      await expect(
        service.create('org-1', 'job-1', 'app-1', {
          title: 'Software Engineer',
          expiresAt: futureDate.toISOString(),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('getForJob', () => {
    it('returns the offer scoped to the job/org', async () => {
      const { prisma, offer } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockResolvedValue({
        id: 'app-1',
        status: 'HIRED',
      } as never);
      offer.findFirst.mockResolvedValue(baseOffer);
      const service = new OffersService(prisma, applicationsService);

      const result = await service.getForJob('org-1', 'job-1', 'app-1');

      expect(offer.findFirst).toHaveBeenCalledWith({
        where: { applicationId: 'app-1', organizationId: 'org-1' },
      });
      expect(result.id).toBe('offer-1');
    });

    it('throws NotFoundException when no offer exists yet', async () => {
      const { prisma, offer } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockResolvedValue({
        id: 'app-1',
        status: 'HIRED',
      } as never);
      offer.findFirst.mockResolvedValue(null);
      const service = new OffersService(prisma, applicationsService);

      await expect(
        service.getForJob('org-1', 'job-1', 'app-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lazily flips a past-expiry SENT offer to EXPIRED', async () => {
      const { prisma, offer } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getForJob.mockResolvedValue({
        id: 'app-1',
        status: 'HIRED',
      } as never);
      offer.findFirst.mockResolvedValue({
        ...baseOffer,
        expiresAt: pastDate,
      });
      offer.update.mockResolvedValue({
        ...baseOffer,
        expiresAt: pastDate,
        status: 'EXPIRED',
      });
      const service = new OffersService(prisma, applicationsService);

      const result = await service.getForJob('org-1', 'job-1', 'app-1');

      expect(offer.update).toHaveBeenCalledWith({
        where: { id: 'offer-1' },
        data: { status: 'EXPIRED' },
      });
      expect(result.status).toBe('EXPIRED');
    });
  });

  describe('getMine', () => {
    it("returns the offer for the caller's own application", async () => {
      const { prisma, offer } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getMine.mockResolvedValue({
        id: 'app-1',
      } as never);
      offer.findFirst.mockResolvedValue(baseOffer);
      const service = new OffersService(prisma, applicationsService);

      const result = await service.getMine('candidate-1', 'app-1');

      expect(applicationsService.getMine).toHaveBeenCalledWith(
        'candidate-1',
        'app-1',
      );
      expect(result.id).toBe('offer-1');
    });

    it("propagates NotFoundException for another candidate's application", async () => {
      const { prisma } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getMine.mockRejectedValue(
        new NotFoundException('Application not found.'),
      );
      const service = new OffersService(prisma, applicationsService);

      await expect(
        service.getMine('candidate-1', 'app-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('respond', () => {
    it('accepts a SENT offer', async () => {
      const { prisma, offer } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getMine.mockResolvedValue({ id: 'app-1' } as never);
      offer.findFirst.mockResolvedValue(baseOffer);
      offer.update.mockResolvedValue({ ...baseOffer, status: 'ACCEPTED' });
      const service = new OffersService(prisma, applicationsService);

      const result = await service.respond('candidate-1', 'app-1', {
        decision: 'ACCEPT',
      });

      expect(offer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'offer-1' },
          data: expect.objectContaining({ status: 'ACCEPTED' }) as unknown,
        }),
      );
      expect(result.status).toBe('ACCEPTED');
    });

    it('declines a SENT offer', async () => {
      const { prisma, offer } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getMine.mockResolvedValue({ id: 'app-1' } as never);
      offer.findFirst.mockResolvedValue(baseOffer);
      offer.update.mockResolvedValue({ ...baseOffer, status: 'DECLINED' });
      const service = new OffersService(prisma, applicationsService);

      const result = await service.respond('candidate-1', 'app-1', {
        decision: 'DECLINE',
      });

      expect(result.status).toBe('DECLINED');
    });

    it('throws ConflictException when the offer is already responded to', async () => {
      const { prisma, offer } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getMine.mockResolvedValue({ id: 'app-1' } as never);
      offer.findFirst.mockResolvedValue({ ...baseOffer, status: 'ACCEPTED' });
      const service = new OffersService(prisma, applicationsService);

      await expect(
        service.respond('candidate-1', 'app-1', { decision: 'DECLINE' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException when the offer has expired', async () => {
      const { prisma, offer } = createPrismaMock();
      const applicationsService = createApplicationsServiceMock();
      applicationsService.getMine.mockResolvedValue({ id: 'app-1' } as never);
      offer.findFirst.mockResolvedValue({
        ...baseOffer,
        expiresAt: pastDate,
      });
      offer.update.mockResolvedValue({
        ...baseOffer,
        expiresAt: pastDate,
        status: 'EXPIRED',
      });
      const service = new OffersService(prisma, applicationsService);

      await expect(
        service.respond('candidate-1', 'app-1', { decision: 'ACCEPT' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
