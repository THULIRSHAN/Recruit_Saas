import {
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantGuard } from './tenant.guard';
import type { AccessTokenPayload } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequireTenantOptions } from '../decorators/require-tenant.decorator';

function createContext(
  user: AccessTokenPayload | undefined,
  params: Record<string, string>,
) {
  const request = { user, params };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function createPrismaMock() {
  return { job: { findUnique: jest.fn() } } as unknown as PrismaService;
}

const OPTIONS: RequireTenantOptions = { model: 'job' };
const user: AccessTokenPayload = {
  sub: 'user-1',
  orgId: 'org-1',
  roles: ['RECRUITER'],
  isSuperAdmin: false,
  email: 'test@example.com',
  fullName: 'Test User',
};

describe('TenantGuard', () => {
  it('allows a route with no @RequireTenant() metadata', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const prisma = createPrismaMock();
    const guard = new TenantGuard(reflector, prisma);

    await expect(
      guard.canActivate(createContext(user, { id: 'job-1' })),
    ).resolves.toBe(true);
    expect(
      (prisma as unknown as { job: { findUnique: jest.Mock } }).job.findUnique,
    ).not.toHaveBeenCalled();
  });

  it('throws Unauthorized if req.user is missing', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(OPTIONS),
    } as unknown as Reflector;
    const prisma = createPrismaMock();
    const guard = new TenantGuard(reflector, prisma);

    await expect(
      guard.canActivate(createContext(undefined, { id: 'job-1' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("allows access when the resource belongs to the caller's active org", async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(OPTIONS),
    } as unknown as Reflector;
    const prisma = createPrismaMock();
    (
      prisma as unknown as { job: { findUnique: jest.Mock } }
    ).job.findUnique.mockResolvedValue({
      organizationId: 'org-1',
    });
    const guard = new TenantGuard(reflector, prisma);

    await expect(
      guard.canActivate(createContext(user, { id: 'job-1' })),
    ).resolves.toBe(true);
  });

  it('returns 404 (not 403) when the resource belongs to a different org', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(OPTIONS),
    } as unknown as Reflector;
    const prisma = createPrismaMock();
    (
      prisma as unknown as { job: { findUnique: jest.Mock } }
    ).job.findUnique.mockResolvedValue({
      organizationId: 'some-other-org',
    });
    const guard = new TenantGuard(reflector, prisma);

    await expect(
      guard.canActivate(createContext(user, { id: 'job-1' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when the resource does not exist at all', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(OPTIONS),
    } as unknown as Reflector;
    const prisma = createPrismaMock();
    (
      prisma as unknown as { job: { findUnique: jest.Mock } }
    ).job.findUnique.mockResolvedValue(null);
    const guard = new TenantGuard(reflector, prisma);

    await expect(
      guard.canActivate(createContext(user, { id: 'does-not-exist' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('respects a custom param name', async () => {
    const customOptions: RequireTenantOptions = {
      model: 'job',
      param: 'jobId',
    };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(customOptions),
    } as unknown as Reflector;
    const prisma = createPrismaMock();
    (
      prisma as unknown as { job: { findUnique: jest.Mock } }
    ).job.findUnique.mockResolvedValue({
      organizationId: 'org-1',
    });
    const guard = new TenantGuard(reflector, prisma);

    await expect(
      guard.canActivate(createContext(user, { jobId: 'job-1' })),
    ).resolves.toBe(true);
    expect(
      (prisma as unknown as { job: { findUnique: jest.Mock } }).job.findUnique,
    ).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      select: { organizationId: true },
    });
  });
});
