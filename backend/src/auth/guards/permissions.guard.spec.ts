import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import type { AccessTokenPayload } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';

function createContext(user?: AccessTokenPayload) {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function createPrismaMock() {
  return {
    rolePermission: { findFirst: jest.fn() },
  } as unknown as PrismaService;
}

describe('PermissionsGuard', () => {
  it('allows a route with no @RequirePermission() metadata', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const prisma = createPrismaMock();
    const guard = new PermissionsGuard(reflector, prisma);

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(prisma.rolePermission.findFirst).not.toHaveBeenCalled();
  });

  it('throws Unauthorized if req.user is missing (JwtAuthGuard did not run first)', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('job:create'),
    } as unknown as Reflector;
    const prisma = createPrismaMock();
    const guard = new PermissionsGuard(reflector, prisma);

    await expect(
      guard.canActivate(createContext(undefined)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('forbids a user with no roles and no isSuperAdmin', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('job:create'),
    } as unknown as Reflector;
    const prisma = createPrismaMock();
    const guard = new PermissionsGuard(reflector, prisma);
    const user: AccessTokenPayload = {
      sub: 'user-1',
      orgId: null,
      roles: [],
      isSuperAdmin: false,
    };

    await expect(guard.canActivate(createContext(user))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.rolePermission.findFirst).not.toHaveBeenCalled();
  });

  it('allows a role that grants the required permission', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('job:create'),
    } as unknown as Reflector;
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
    };

    await expect(guard.canActivate(createContext(user))).resolves.toBe(true);
    expect(prisma.rolePermission.findFirst).toHaveBeenCalledWith({
      where: {
        role: { key: { in: ['RECRUITER'] } },
        permission: { key: 'job:create' },
      },
    });
  });

  it('forbids a role that does not grant the required permission', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('job:create'),
    } as unknown as Reflector;
    const prisma = createPrismaMock();
    (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue(null);
    const guard = new PermissionsGuard(reflector, prisma);
    const user: AccessTokenPayload = {
      sub: 'user-1',
      orgId: 'org-1',
      roles: ['INTERVIEWER'],
      isSuperAdmin: false,
    };

    await expect(guard.canActivate(createContext(user))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('treats isSuperAdmin as implicitly holding SUPER_ADMIN, not a blanket bypass', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('organization:approve'),
    } as unknown as Reflector;
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
    };

    await expect(guard.canActivate(createContext(user))).resolves.toBe(true);
    expect(prisma.rolePermission.findFirst).toHaveBeenCalledWith({
      where: {
        role: { key: { in: ['SUPER_ADMIN'] } },
        permission: { key: 'organization:approve' },
      },
    });
  });

  it('still forbids a Super Admin for an org-scoped permission SUPER_ADMIN was never granted', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('job:create'),
    } as unknown as Reflector;
    const prisma = createPrismaMock();
    (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue(null);
    const guard = new PermissionsGuard(reflector, prisma);
    const user: AccessTokenPayload = {
      sub: 'admin-1',
      orgId: null,
      roles: [],
      isSuperAdmin: true,
    };

    await expect(guard.canActivate(createContext(user))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
