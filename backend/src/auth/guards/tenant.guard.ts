import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth.service';
import {
  REQUIRE_TENANT_KEY,
  RequireTenantOptions,
} from '../decorators/require-tenant.decorator';

interface TenantScopedDelegate {
  findUnique: (args: {
    where: { id: string };
    select: { organizationId: true };
  }) => Promise<{
    organizationId: string;
  } | null>;
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<
      RequireTenantOptions | undefined
    >(REQUIRE_TENANT_KEY, [context.getHandler(), context.getClass()]);
    if (!options) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AccessTokenPayload }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    const paramName = options.param ?? 'id';
    const resourceId = request.params[paramName];
    if (typeof resourceId !== 'string') {
      throw new NotFoundException();
    }

    // Prisma's client exposes one delegate per model (job, application,
    // ...) with an identical findUnique shape for our purposes here --
    // there's no fully type-safe way to index into it dynamically by a
    // string model name, so this is an intentional, isolated cast.
    const delegate = (
      this.prisma as unknown as Record<string, TenantScopedDelegate>
    )[options.model];
    const resource = await delegate.findUnique({
      where: { id: resourceId },
      select: { organizationId: true },
    });

    // 404, not 403, per docs/multi-tenancy.md §5: a cross-tenant access
    // attempt must not confirm the resource exists at all. Same response
    // whether the resource is missing entirely or belongs to another org.
    if (!resource || resource.organizationId !== user.orgId) {
      throw new NotFoundException();
    }

    return true;
  }
}
