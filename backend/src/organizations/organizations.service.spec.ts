import { OrganizationsService } from './organizations.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

function createPrismaMock() {
  const txMock = {
    organization: { create: jest.fn() },
    role: { findUniqueOrThrow: jest.fn() },
    userOrganizationRole: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    ),
  };
  return { prisma: prisma as unknown as PrismaService, tx: txMock };
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
});
