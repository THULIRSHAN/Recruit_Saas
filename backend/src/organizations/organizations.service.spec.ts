import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

function createPrismaMock() {
  const txMock = {
    organization: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    role: { findUniqueOrThrow: jest.fn() },
    userOrganizationRole: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const topLevel = {
    organization: { findMany: jest.fn(), count: jest.fn() },
  };
  const prisma = {
    ...topLevel,
    // Interactive-transaction form (a callback) is used by
    // approve/reject/registerOrganization; the batch form (an array of
    // pre-built queries) is used by list() -- both need supporting here.
    $transaction: jest.fn(
      (arg: ((tx: typeof txMock) => unknown) | Promise<unknown>[]) =>
        typeof arg === 'function' ? arg(txMock) : Promise.all(arg),
    ),
  };
  return {
    prisma: prisma as unknown as PrismaService,
    tx: txMock,
    topLevel,
  };
}

describe('OrganizationsService', () => {
  describe('registerOrganization', () => {
    it('creates the organization, owner user, and COMPANY_OWNER role assignment in one transaction', async () => {
      const { prisma, tx } = createPrismaMock();
      const authService = {
        createUserAccount: jest.fn().mockResolvedValue({
          user: {
            id: 'user-1',
            email: 'owner@example.com',
            fullName: 'Org Owner',
          },
        }),
      } as unknown as AuthService;
      tx.organization.create.mockResolvedValue({
        id: 'org-1',
        name: 'Acme Recruiting',
        status: 'PENDING_APPROVAL',
      });
      tx.role.findUniqueOrThrow.mockResolvedValue({ id: 'role-company-owner' });

      const service = new OrganizationsService(prisma, authService);
      const result = await service.registerOrganization({
        organizationName: 'Acme Recruiting',
        ownerFullName: 'Org Owner',
        ownerEmail: 'owner@example.com',
        ownerPassword: 'password123',
      });

      expect(authService.createUserAccount).toHaveBeenCalledWith(
        {
          email: 'owner@example.com',
          password: 'password123',
          fullName: 'Org Owner',
        },
        tx,
      );
      expect(tx.organization.create).toHaveBeenCalledWith({
        data: { name: 'Acme Recruiting' },
      });
      expect(tx.role.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { key: 'COMPANY_OWNER' },
      });
      expect(tx.userOrganizationRole.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          organizationId: 'org-1',
          roleId: 'role-company-owner',
        },
      });

      expect(result).toEqual({
        organization: {
          id: 'org-1',
          name: 'Acme Recruiting',
          status: 'PENDING_APPROVAL',
        },
        owner: {
          id: 'user-1',
          email: 'owner@example.com',
          fullName: 'Org Owner',
        },
      });
    });

    it('propagates a duplicate-email error from createUserAccount without creating an organization', async () => {
      const { prisma, tx } = createPrismaMock();
      const duplicateError = new Error('An account may already exist.');
      const authService = {
        createUserAccount: jest.fn().mockRejectedValue(duplicateError),
      } as unknown as AuthService;

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.registerOrganization({
          organizationName: 'Acme Recruiting',
          ownerFullName: 'Org Owner',
          ownerEmail: 'owner@example.com',
          ownerPassword: 'password123',
        }),
      ).rejects.toBe(duplicateError);
      expect(tx.organization.create).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('activates a PENDING_APPROVAL organization and writes an AuditLog entry', async () => {
      const { prisma, tx } = createPrismaMock();
      const authService = {} as unknown as AuthService;
      tx.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        status: 'PENDING_APPROVAL',
      });
      tx.organization.update.mockResolvedValue({
        id: 'org-1',
        name: 'Acme Recruiting',
        status: 'ACTIVE',
      });

      const service = new OrganizationsService(prisma, authService);
      const result = await service.approve('org-1', 'admin-1');

      expect(tx.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { status: 'ACTIVE', approvedAt: expect.any(Date) as Date },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'admin-1',
          organizationId: 'org-1',
          action: 'organization.approved',
          targetType: 'Organization',
          targetId: 'org-1',
        },
      });
      expect(result).toEqual({
        id: 'org-1',
        name: 'Acme Recruiting',
        status: 'ACTIVE',
      });
    });

    it('throws NotFoundException for a nonexistent organization', async () => {
      const { prisma, tx } = createPrismaMock();
      const authService = {} as unknown as AuthService;
      tx.organization.findUnique.mockResolvedValue(null);

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.approve('missing', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.organization.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException if the organization is not PENDING_APPROVAL', async () => {
      const { prisma, tx } = createPrismaMock();
      const authService = {} as unknown as AuthService;
      tx.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        status: 'ACTIVE',
      });

      const service = new OrganizationsService(prisma, authService);

      await expect(service.approve('org-1', 'admin-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.organization.update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('rejects a PENDING_APPROVAL organization with a reason and writes an AuditLog entry', async () => {
      const { prisma, tx } = createPrismaMock();
      const authService = {} as unknown as AuthService;
      tx.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        status: 'PENDING_APPROVAL',
      });
      tx.organization.update.mockResolvedValue({
        id: 'org-1',
        name: 'Acme Recruiting',
        status: 'REJECTED',
      });

      const service = new OrganizationsService(prisma, authService);
      const result = await service.reject(
        'org-1',
        'admin-1',
        'Duplicate signup',
      );

      expect(tx.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { status: 'REJECTED', rejectedReason: 'Duplicate signup' },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'admin-1',
          organizationId: 'org-1',
          action: 'organization.rejected',
          targetType: 'Organization',
          targetId: 'org-1',
          metadata: { reason: 'Duplicate signup' },
        },
      });
      expect(result).toEqual({
        id: 'org-1',
        name: 'Acme Recruiting',
        status: 'REJECTED',
      });
    });

    it('throws ConflictException if the organization was already approved', async () => {
      const { prisma, tx } = createPrismaMock();
      const authService = {} as unknown as AuthService;
      tx.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        status: 'ACTIVE',
      });

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.reject('org-1', 'admin-1', 'too late'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.organization.update).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns a paginated envelope filtered by status', async () => {
      const { prisma, topLevel } = createPrismaMock();
      const authService = {} as unknown as AuthService;
      topLevel.organization.findMany.mockResolvedValue([
        { id: 'org-1', name: 'Acme', status: 'PENDING_APPROVAL' },
      ]);
      topLevel.organization.count.mockResolvedValue(1);

      const service = new OrganizationsService(prisma, authService);
      const result = await service.list({
        status: 'PENDING_APPROVAL',
        page: 1,
        pageSize: 20,
      });

      expect(topLevel.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING_APPROVAL' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toEqual({
        data: [{ id: 'org-1', name: 'Acme', status: 'PENDING_APPROVAL' }],
        meta: { page: 1, pageSize: 20, total: 1 },
      });
    });

    it('omits the status filter and applies skip/take for later pages when no status is given', async () => {
      const { prisma, topLevel } = createPrismaMock();
      const authService = {} as unknown as AuthService;
      topLevel.organization.findMany.mockResolvedValue([]);
      topLevel.organization.count.mockResolvedValue(0);

      const service = new OrganizationsService(prisma, authService);
      await service.list({ page: 3, pageSize: 10 });

      expect(topLevel.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 20, take: 10 }),
      );
    });
  });
});
