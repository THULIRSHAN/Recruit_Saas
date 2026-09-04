import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
    user: { findUnique: jest.fn() },
    userOrganizationRole: { create: jest.fn(), findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
    invitation: { updateMany: jest.fn() },
  };
  const topLevel = {
    organization: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    role: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    userOrganizationRole: { findUnique: jest.fn() },
    invitation: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
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

  describe('getMine', () => {
    it("returns the org identified by the caller's own orgId", async () => {
      const { prisma, topLevel } = createPrismaMock();
      const authService = {} as unknown as AuthService;
      topLevel.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Acme',
        status: 'PENDING_APPROVAL',
        createdAt: new Date('2026-01-01'),
        approvedAt: null,
        rejectedReason: null,
      });

      const service = new OrganizationsService(prisma, authService);
      const result = await service.getMine('org-1');

      expect(topLevel.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-1' },
      });
      expect(result).toMatchObject({ id: 'org-1', status: 'PENDING_APPROVAL' });
    });

    it('throws NotFoundException when the caller has no org in their token', async () => {
      const { prisma, topLevel } = createPrismaMock();
      const authService = {} as unknown as AuthService;

      const service = new OrganizationsService(prisma, authService);

      await expect(service.getMine(null)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(topLevel.organization.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('updateMine', () => {
    it("updates the name of the caller's own ACTIVE organization", async () => {
      const { prisma, topLevel } = createPrismaMock();
      const authService = {} as unknown as AuthService;
      topLevel.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Old Name',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01'),
        approvedAt: new Date('2026-01-02'),
        rejectedReason: null,
      });
      topLevel.organization.update.mockResolvedValue({
        id: 'org-1',
        name: 'New Name',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01'),
        approvedAt: new Date('2026-01-02'),
        rejectedReason: null,
      });

      const service = new OrganizationsService(prisma, authService);
      const result = await service.updateMine('org-1', { name: 'New Name' });

      expect(topLevel.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { name: 'New Name' },
      });
      expect(result).toMatchObject({ id: 'org-1', name: 'New Name' });
    });

    it('throws ConflictException if the organization is not yet ACTIVE', async () => {
      const { prisma, topLevel } = createPrismaMock();
      const authService = {} as unknown as AuthService;
      topLevel.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Old Name',
        status: 'PENDING_APPROVAL',
        createdAt: new Date('2026-01-01'),
        approvedAt: null,
        rejectedReason: null,
      });

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.updateMine('org-1', { name: 'New Name' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(topLevel.organization.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the caller has no org in their token', async () => {
      const { prisma } = createPrismaMock();
      const authService = {} as unknown as AuthService;

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.updateMine(null, { name: 'New Name' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('inviteStaff', () => {
    function createAuthServiceMock() {
      return {
        generateOpaqueToken: jest.fn().mockReturnValue('raw-token'),
        hashOpaqueToken: jest.fn().mockReturnValue('hashed-token'),
      } as unknown as AuthService;
    }

    it('creates an invitation for an ACTIVE org and a valid, invitable role', async () => {
      const { prisma, topLevel } = createPrismaMock();
      const authService = createAuthServiceMock();
      topLevel.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Acme',
        status: 'ACTIVE',
      });
      topLevel.role.findUnique.mockResolvedValue({
        id: 'role-recruiter',
        key: 'RECRUITER',
        name: 'Recruiter',
        isPlatformRole: false,
      });
      topLevel.user.findUnique.mockResolvedValue(null);
      topLevel.invitation.findFirst.mockResolvedValue(null);
      topLevel.invitation.create.mockResolvedValue({
        id: 'invite-1',
        email: 'new-hire@example.com',
        expiresAt: new Date('2026-01-08'),
        createdAt: new Date('2026-01-01'),
      });

      const service = new OrganizationsService(prisma, authService);
      const result = await service.inviteStaff('org-1', {
        email: 'new-hire@example.com',
        roleKey: 'RECRUITER',
      });

      expect(topLevel.invitation.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          email: 'new-hire@example.com',
          roleId: 'role-recruiter',
          tokenHash: 'hashed-token',
          expiresAt: expect.any(Date) as Date,
        },
      });
      expect(result).toMatchObject({
        id: 'invite-1',
        email: 'new-hire@example.com',
        role: { key: 'RECRUITER', name: 'Recruiter' },
      });
    });

    it('throws ConflictException if the organization is not ACTIVE', async () => {
      const { prisma, topLevel } = createPrismaMock();
      const authService = createAuthServiceMock();
      topLevel.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        status: 'PENDING_APPROVAL',
      });

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.inviteStaff('org-1', {
          email: 'new-hire@example.com',
          roleKey: 'RECRUITER',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(topLevel.invitation.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for an unknown role key', async () => {
      const { prisma, topLevel } = createPrismaMock();
      const authService = createAuthServiceMock();
      topLevel.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        status: 'ACTIVE',
      });
      topLevel.role.findUnique.mockResolvedValue(null);

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.inviteStaff('org-1', {
          email: 'new-hire@example.com',
          roleKey: 'NOT_A_REAL_ROLE',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException for CANDIDATE and platform roles', async () => {
      const { prisma, topLevel } = createPrismaMock();
      const authService = createAuthServiceMock();
      topLevel.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        status: 'ACTIVE',
      });
      topLevel.role.findUnique.mockResolvedValue({
        id: 'role-super-admin',
        key: 'SUPER_ADMIN',
        name: 'Super Admin',
        isPlatformRole: true,
      });

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.inviteStaff('org-1', {
          email: 'new-hire@example.com',
          roleKey: 'SUPER_ADMIN',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException if the invited email already holds that role at the org', async () => {
      const { prisma, topLevel } = createPrismaMock();
      const authService = createAuthServiceMock();
      topLevel.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        status: 'ACTIVE',
      });
      topLevel.role.findUnique.mockResolvedValue({
        id: 'role-recruiter',
        key: 'RECRUITER',
        name: 'Recruiter',
        isPlatformRole: false,
      });
      topLevel.user.findUnique.mockResolvedValue({ id: 'user-1' });
      topLevel.userOrganizationRole.findUnique.mockResolvedValue({
        id: 'membership-1',
      });

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.inviteStaff('org-1', {
          email: 'existing@example.com',
          roleKey: 'RECRUITER',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(topLevel.invitation.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException if a pending invitation already exists for the same email and role', async () => {
      const { prisma, topLevel } = createPrismaMock();
      const authService = createAuthServiceMock();
      topLevel.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        status: 'ACTIVE',
      });
      topLevel.role.findUnique.mockResolvedValue({
        id: 'role-recruiter',
        key: 'RECRUITER',
        name: 'Recruiter',
        isPlatformRole: false,
      });
      topLevel.user.findUnique.mockResolvedValue(null);
      topLevel.invitation.findFirst.mockResolvedValue({ id: 'pending-1' });

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.inviteStaff('org-1', {
          email: 'new-hire@example.com',
          roleKey: 'RECRUITER',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(topLevel.invitation.create).not.toHaveBeenCalled();
    });
  });

  describe('acceptInvitation', () => {
    function mockValidPendingInvitation(
      topLevel: ReturnType<typeof createPrismaMock>['topLevel'],
    ) {
      topLevel.invitation.findUnique.mockResolvedValue({
        id: 'invite-1',
        organizationId: 'org-1',
        email: 'invitee@example.com',
        roleId: 'role-recruiter',
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
    }

    it('creates a new user, pre-verified, and attaches the role (new-user path)', async () => {
      const { prisma, tx, topLevel } = createPrismaMock();
      mockValidPendingInvitation(topLevel);
      tx.invitation.updateMany.mockResolvedValue({ count: 1 });
      tx.role.findUniqueOrThrow.mockResolvedValue({
        id: 'role-recruiter',
        key: 'RECRUITER',
        name: 'Recruiter',
      });
      tx.user.findUnique.mockResolvedValue(null);
      tx.userOrganizationRole.findUnique.mockResolvedValue(null);
      const authService = {
        hashOpaqueToken: jest.fn().mockReturnValue('hashed-token'),
        createUserAccount: jest.fn().mockResolvedValue({
          user: { id: 'user-new', email: 'invitee@example.com' },
        }),
      } as unknown as AuthService;

      const service = new OrganizationsService(prisma, authService);
      const result = await service.acceptInvitation('raw-token', {
        fullName: 'New Hire',
        password: 'password123',
      });

      expect(authService.createUserAccount).toHaveBeenCalledWith(
        {
          email: 'invitee@example.com',
          password: 'password123',
          fullName: 'New Hire',
        },
        tx,
        { emailPreVerified: true },
      );
      expect(tx.userOrganizationRole.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-new',
          organizationId: 'org-1',
          roleId: 'role-recruiter',
        },
      });
      expect(result).toEqual({
        organizationId: 'org-1',
        email: 'invitee@example.com',
        role: { key: 'RECRUITER', name: 'Recruiter' },
      });
    });

    it('attaches the role to an existing user without creating a new account (existing-user path)', async () => {
      const { prisma, tx, topLevel } = createPrismaMock();
      mockValidPendingInvitation(topLevel);
      tx.invitation.updateMany.mockResolvedValue({ count: 1 });
      tx.role.findUniqueOrThrow.mockResolvedValue({
        id: 'role-recruiter',
        key: 'RECRUITER',
        name: 'Recruiter',
      });
      tx.user.findUnique.mockResolvedValue({
        id: 'user-existing',
        email: 'invitee@example.com',
      });
      tx.userOrganizationRole.findUnique.mockResolvedValue(null);
      const authService = {
        hashOpaqueToken: jest.fn().mockReturnValue('hashed-token'),
        createUserAccount: jest.fn(),
      } as unknown as AuthService;

      const service = new OrganizationsService(prisma, authService);
      await service.acceptInvitation('raw-token', {});

      expect(authService.createUserAccount).not.toHaveBeenCalled();
      expect(tx.userOrganizationRole.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-existing',
          organizationId: 'org-1',
          roleId: 'role-recruiter',
        },
      });
    });

    it('is idempotent if the existing user already holds the role', async () => {
      const { prisma, tx, topLevel } = createPrismaMock();
      mockValidPendingInvitation(topLevel);
      tx.invitation.updateMany.mockResolvedValue({ count: 1 });
      tx.role.findUniqueOrThrow.mockResolvedValue({
        id: 'role-recruiter',
        key: 'RECRUITER',
        name: 'Recruiter',
      });
      tx.user.findUnique.mockResolvedValue({
        id: 'user-existing',
        email: 'invitee@example.com',
      });
      tx.userOrganizationRole.findUnique.mockResolvedValue({
        id: 'membership-1',
      });
      const authService = {
        hashOpaqueToken: jest.fn().mockReturnValue('hashed-token'),
      } as unknown as AuthService;

      const service = new OrganizationsService(prisma, authService);
      await service.acceptInvitation('raw-token', {});

      expect(tx.userOrganizationRole.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the token does not match any invitation', async () => {
      const { prisma, topLevel } = createPrismaMock();
      topLevel.invitation.findUnique.mockResolvedValue(null);
      const authService = {
        hashOpaqueToken: jest.fn().mockReturnValue('hashed-token'),
      } as unknown as AuthService;

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.acceptInvitation('raw-token', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException for an already-accepted invitation', async () => {
      const { prisma, topLevel } = createPrismaMock();
      topLevel.invitation.findUnique.mockResolvedValue({
        id: 'invite-1',
        organizationId: 'org-1',
        email: 'invitee@example.com',
        roleId: 'role-recruiter',
        acceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      const authService = {
        hashOpaqueToken: jest.fn().mockReturnValue('hashed-token'),
      } as unknown as AuthService;

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.acceptInvitation('raw-token', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException for an expired invitation', async () => {
      const { prisma, topLevel } = createPrismaMock();
      topLevel.invitation.findUnique.mockResolvedValue({
        id: 'invite-1',
        organizationId: 'org-1',
        email: 'invitee@example.com',
        roleId: 'role-recruiter',
        acceptedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      });
      const authService = {
        hashOpaqueToken: jest.fn().mockReturnValue('hashed-token'),
      } as unknown as AuthService;

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.acceptInvitation('raw-token', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException for a new user missing fullName/password', async () => {
      const { prisma, tx, topLevel } = createPrismaMock();
      mockValidPendingInvitation(topLevel);
      tx.invitation.updateMany.mockResolvedValue({ count: 1 });
      tx.role.findUniqueOrThrow.mockResolvedValue({
        id: 'role-recruiter',
        key: 'RECRUITER',
        name: 'Recruiter',
      });
      tx.user.findUnique.mockResolvedValue(null);
      const authService = {
        hashOpaqueToken: jest.fn().mockReturnValue('hashed-token'),
      } as unknown as AuthService;

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.acceptInvitation('raw-token', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.userOrganizationRole.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException if a concurrent request already claimed the token', async () => {
      const { prisma, tx, topLevel } = createPrismaMock();
      mockValidPendingInvitation(topLevel);
      tx.invitation.updateMany.mockResolvedValue({ count: 0 });
      const authService = {
        hashOpaqueToken: jest.fn().mockReturnValue('hashed-token'),
      } as unknown as AuthService;

      const service = new OrganizationsService(prisma, authService);

      await expect(
        service.acceptInvitation('raw-token', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.role.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });
});
