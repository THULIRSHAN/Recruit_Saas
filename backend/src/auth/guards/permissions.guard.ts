import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth.service';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';

const FORBIDDEN_MESSAGE = 'You do not have permission to perform this action.';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<
      string | undefined
    >(REQUIRE_PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredPermission) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AccessTokenPayload }>();
    const user = request.user;
    // JwtAuthGuard (registered first, see AppModule) must have already run
    // and populated this -- if it didn't, something is misconfigured.
    if (!user) {
      throw new UnauthorizedException();
    }

    // Two independent permission spaces (docs/authorization.md §5): treat
    // isSuperAdmin as implicitly holding the SUPER_ADMIN role for this
    // lookup, rather than bypassing the check entirely -- a Super Admin
    // still doesn't get org-scoped permissions (job:create etc.) they were
    // never granted, only the platform-level ones seeded onto SUPER_ADMIN.
    const roleKeys = user.isSuperAdmin
      ? [...user.roles, 'SUPER_ADMIN']
      : user.roles;
    if (roleKeys.length === 0) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    const grant = await this.prisma.rolePermission.findFirst({
      where: {
        role: { key: { in: roleKeys } },
        permission: { key: requiredPermission },
      },
    });
    if (!grant) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    return true;
  }
}
