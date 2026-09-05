import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import type { AccessTokenPayload } from '../auth.service';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { RequiredPermission } from '../decorators/require-permission.decorator';
import { REQUIRE_TENANT_KEY } from '../decorators/require-tenant.decorator';
import { PrismaService } from '../../prisma/prisma.service';

function createContext(user?: AccessTokenPayload) {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

// hasTenantScope simulates a route also carrying @RequireTenant() -- the
// two decorators read independent metadata keys off the same handler.
function createReflectorMock(
  required: RequiredPermission | undefined,
  hasTenantScope = false,
) {
  return {
    getAllAndOverride: jest.fn((key: string) =>
      key === REQUIRE_PERMISSION_KEY
        ? required
        : key === REQUIRE_TENANT_KEY
          ? hasTenantScope
            ? { model: 'job' }
            : undefined
          : undefined,
    ),
  } as unknown as Reflector;
}

function createPrismaMock() {
  return {
    rolePermission: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    userOrganizationRole: { findMany: jest.fn() },
  } as unknown as PrismaService;
}

describe('PermissionsGuard', () => {
  it('allows a route with no @RequirePermission() metadata', async () => {
    const reflector = createReflectorMock(undefined);
    const prisma = createPrismaMock();
    const guard = new PermissionsGuard(reflector, prisma);

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(prisma.rolePermission.findFirst).not.toHaveBeenCalled();
  });

  it('throws Unauthorized if req.user is missing (JwtAuthGuard did not run first)', async () => {
    const reflector = createReflectorMock({ permission: 'job:create' });
    const prisma = createPrismaMock();
    const guard = new PermissionsGuard(reflector, prisma);

    await expect(
      guard.canActivate(createContext(undefined)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('forbids a user with no org roles and no isSuperAdmin for an org-scoped permission (CANDIDATE alone does not grant it)', async () => {
    const reflector = createReflectorMock({ permission: 'job:create' });
    const prisma = createPrismaMock();
    (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue(null);
    const guard = new PermissionsGuard(reflector, prisma);
    const user: AccessTokenPayload = {
      sub: 'user-1',
      orgId: null,
      roles: [],
      isSuperAdmin: false,
      email: 'test@example.com',
      fullName: 'Test User',
    };

    await expect(guard.canActivate(createContext(user))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // Still queried -- CANDIDATE is implicit for every authenticated user
    // (docs/open-questions.md Q19), so this is a real "not granted" check,
    // not an early exit.
    expect(prisma.rolePermission.findFirst).toHaveBeenCalledWith({
      where: {
        role: { key: { in: ['CANDIDATE'] } },
        permission: { key: 'job:create' },
      },
    });
  });

  it('allows a role that grants the required permission', async () => {
    const reflector = createReflectorMock({ permission: 'job:create' });
    const prisma = createPrismaMock();
    (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue({
      roleId: 'r1',
      permissionId: 'p1',
    });
    const guard = new PermissionsGuard(reflector, prisma);
    const user: AccessTokenPayload = {
      sub: 'user-1',
      orgId: 'org-1',
      roles: ['RECRUITER'],
      isSuperAdmin: false,
      email: 'test@example.com',
      fullName: 'Test User',
    };

    await expect(guard.canActivate(createContext(user))).resolves.toBe(true);
    expect(prisma.rolePermission.findFirst).toHaveBeenCalledWith({
      where: {
        role: { key: { in: ['RECRUITER', 'CANDIDATE'] } },
        permission: { key: 'job:create' },
      },
    });
  });

  it('grants a candidate-only permission (e.g. application:create) to any authenticated user, including org staff (docs/open-questions.md Q19)', async () => {
    const reflector = createReflectorMock({ permission: 'application:create' });
    const prisma = createPrismaMock();
    (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue({
      roleId: 'r1',
      permissionId: 'p1',
    });
    const guard = new PermissionsGuard(reflector, prisma);
    const user: AccessTokenPayload = {
      sub: 'user-1',
      orgId: 'org-1',
      roles: ['RECRUITER'],
      isSuperAdmin: false,
      email: 'test@example.com',
      fullName: 'Test User',
    };

    await expect(guard.canActivate(createContext(user))).resolves.toBe(true);
    expect(prisma.rolePermission.findFirst).toHaveBeenCalledWith({
      where: {
        role: { key: { in: ['RECRUITER', 'CANDIDATE'] } },
        permission: { key: 'application:create' },
      },
    });
  });

  it('excludes the implicit CANDIDATE grant on a route also carrying @RequireTenant() (docs/open-questions.md Q23)', async () => {
    // application:read is granted to both CANDIDATE (self-scoped) and
    // RECRUITER (org-scoped, docs/authorization.md §3) -- found as a real
    // bug in M7.4 (JobApplicationsController): without this exclusion, an
    // Interviewer with no application:read grant of their own could still
    // pass this check purely via the blanket CANDIDATE fallback, on a route
    // that is unambiguously org-resource-scoped (it carries @RequireTenant).
    const reflector = createReflectorMock(
      { permission: 'application:read' },
      true,
    );
    const prisma = createPrismaMock();
    (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue(null);
    const guard = new PermissionsGuard(reflector, prisma);
    const user: AccessTokenPayload = {
      sub: 'user-1',
      orgId: 'org-1',
      roles: ['INTERVIEWER'],
      isSuperAdmin: false,
      email: 'test@example.com',
      fullName: 'Test User',
    };

    await expect(guard.canActivate(createContext(user))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.rolePermission.findFirst).toHaveBeenCalledWith({
      where: {
        role: { key: { in: ['INTERVIEWER'] } },
        permission: { key: 'application:read' },
      },
    });
  });

  it('still allows an org role that actually grants the permission on a @RequireTenant() route', async () => {
    const reflector = createReflectorMock(
      { permission: 'application:read' },
      true,
    );
    const prisma = createPrismaMock();
    (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue({
      roleId: 'r1',
      permissionId: 'p1',
    });
    const guard = new PermissionsGuard(reflector, prisma);
    const user: AccessTokenPayload = {
      sub: 'user-1',
      orgId: 'org-1',
      roles: ['RECRUITER'],
      isSuperAdmin: false,
      email: 'test@example.com',
      fullName: 'Test User',
    };

    await expect(guard.canActivate(createContext(user))).resolves.toBe(true);
    expect(prisma.rolePermission.findFirst).toHaveBeenCalledWith({
      where: {
        role: { key: { in: ['RECRUITER'] } },
        permission: { key: 'application:read' },
      },
    });
  });

  it('forbids a role that does not grant the required permission', async () => {
    const reflector = createReflectorMock({ permission: 'job:create' });
    const prisma = createPrismaMock();
    (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue(null);
    const guard = new PermissionsGuard(reflector, prisma);
    const user: AccessTokenPayload = {
      sub: 'user-1',
      orgId: 'org-1',
      roles: ['INTERVIEWER'],
      isSuperAdmin: false,
      email: 'test@example.com',
      fullName: 'Test User',
    };

    await expect(guard.canActivate(createContext(user))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('treats isSuperAdmin as implicitly holding SUPER_ADMIN, not a blanket bypass', async () => {
    const reflector = createReflectorMock({
      permission: 'organization:approve',
    });
    const prisma = createPrismaMock();
    (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue({
      roleId: 'r1',
      permissionId: 'p1',
    });
    const guard = new PermissionsGuard(reflector, prisma);
    const user: AccessTokenPayload = {
      sub: 'admin-1',
      orgId: null,
      roles: [],
      isSuperAdmin: true,
      email: 'test@example.com',
      fullName: 'Test User',
    };

    await expect(guard.canActivate(createContext(user))).resolves.toBe(true);
    expect(prisma.rolePermission.findFirst).toHaveBeenCalledWith({
      where: {
        role: { key: { in: ['SUPER_ADMIN', 'CANDIDATE'] } },
        permission: { key: 'organization:approve' },
      },
    });
  });

  it('still forbids a Super Admin for an org-scoped permission SUPER_ADMIN was never granted', async () => {
    const reflector = createReflectorMock({ permission: 'job:create' });
    const prisma = createPrismaMock();
    (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue(null);
    const guard = new PermissionsGuard(reflector, prisma);
    const user: AccessTokenPayload = {
      sub: 'admin-1',
      orgId: null,
      roles: [],
      isSuperAdmin: true,
      email: 'test@example.com',
      fullName: 'Test User',
    };

    await expect(guard.canActivate(createContext(user))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  describe('reVerify: true (docs/authorization.md §4 trust boundary)', () => {
    it('re-reads isSuperAdmin from the database instead of trusting the token claim', async () => {
      const reflector = createReflectorMock({
        permission: 'organization:approve',
        reVerify: true,
      });
      const prisma = createPrismaMock();
      // Token claims isSuperAdmin: false (stale/tampered), but the DB says
      // otherwise -- the DB value must win.
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isSuperAdmin: true,
        email: 'test@example.com',
        fullName: 'Test User',
      });
      (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue({
        roleId: 'r1',
        permissionId: 'p1',
      });
      const guard = new PermissionsGuard(reflector, prisma);
      const user: AccessTokenPayload = {
        sub: 'admin-1',
        orgId: null,
        roles: [],
        isSuperAdmin: false,
        email: 'test@example.com',
        fullName: 'Test User',
      };

      await expect(guard.canActivate(createContext(user))).resolves.toBe(true);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        select: { isSuperAdmin: true },
      });
      expect(prisma.rolePermission.findFirst).toHaveBeenCalledWith({
        where: {
          role: { key: { in: ['SUPER_ADMIN', 'CANDIDATE'] } },
          permission: { key: 'organization:approve' },
        },
      });
    });

    it('forbids when the DB no longer grants isSuperAdmin, even if the token still claims it', async () => {
      const reflector = createReflectorMock({
        permission: 'organization:approve',
        reVerify: true,
      });
      const prisma = createPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isSuperAdmin: false,
        email: 'test@example.com',
        fullName: 'Test User',
      });
      (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue(null);
      const guard = new PermissionsGuard(reflector, prisma);
      const user: AccessTokenPayload = {
        sub: 'admin-1',
        orgId: null,
        roles: [],
        isSuperAdmin: true,
        email: 'test@example.com',
        fullName: 'Test User',
      };

      await expect(
        guard.canActivate(createContext(user)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // CANDIDATE alone doesn't grant a platform-level permission -- still
      // a real DB check, not an early exit (docs/open-questions.md Q19).
      expect(prisma.rolePermission.findFirst).toHaveBeenCalledWith({
        where: {
          role: { key: { in: ['CANDIDATE'] } },
          permission: { key: 'organization:approve' },
        },
      });
    });

    it('throws Unauthorized if the user row no longer exists', async () => {
      const reflector = createReflectorMock({
        permission: 'organization:approve',
        reVerify: true,
      });
      const prisma = createPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const guard = new PermissionsGuard(reflector, prisma);
      const user: AccessTokenPayload = {
        sub: 'admin-1',
        orgId: null,
        roles: [],
        isSuperAdmin: true,
        email: 'test@example.com',
        fullName: 'Test User',
      };

      await expect(
        guard.canActivate(createContext(user)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('re-reads org-scoped roles from the database when the user has an active org', async () => {
      const reflector = createReflectorMock({
        permission: 'job:create',
        reVerify: true,
      });
      const prisma = createPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isSuperAdmin: false,
        email: 'test@example.com',
        fullName: 'Test User',
      });
      (prisma.userOrganizationRole.findMany as jest.Mock).mockResolvedValue([
        { role: { key: 'RECRUITER' } },
      ]);
      (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue({
        roleId: 'r1',
        permissionId: 'p1',
      });
      const guard = new PermissionsGuard(reflector, prisma);
      const user: AccessTokenPayload = {
        sub: 'user-1',
        orgId: 'org-1',
        roles: [],
        isSuperAdmin: false,
        email: 'test@example.com',
        fullName: 'Test User',
      };

      await expect(guard.canActivate(createContext(user))).resolves.toBe(true);
      expect(prisma.userOrganizationRole.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', organizationId: 'org-1' },
        include: { role: true },
      });
    });
  });
});
