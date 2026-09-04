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
import {
  REQUIRE_PERMISSION_KEY,
  type RequiredPermission,
} from '../decorators/require-permission.decorator';

const FORBIDDEN_MESSAGE = 'You do not have permission to perform this action.';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<
      RequiredPermission | undefined
    >(REQUIRE_PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!required) {
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

    const { isSuperAdmin, roles } = required.reVerify
      ? await this.reVerifyFromDatabase(user)
      : { isSuperAdmin: user.isSuperAdmin, roles: user.roles };

    // Two independent permission spaces (docs/authorization.md §5): treat
    // isSuperAdmin as implicitly holding the SUPER_ADMIN role for this
    // lookup, rather than bypassing the check entirely -- a Super Admin
    // still doesn't get org-scoped permissions (job:create etc.) they were
    // never granted, only the platform-level ones seeded onto SUPER_ADMIN.
    //
    // CANDIDATE is likewise implicit for every authenticated user
    // (docs/open-questions.md Q11: no UserOrganizationRole row is ever
    // created for it) -- and per Q3/REQ-AUTH-008, the same login can be
    // both org staff and a candidate, so this is unconditional, not just
    // a fallback for users with no org roles. This is what makes
    // candidate-facing endpoints (application:create, candidateProfile:
    // update, ...) usable via the same centralized @RequirePermission()
    // mechanism as everything else (CLAUDE.md rule 1) instead of a
    // scattered if-check -- the *resource-level* restriction (only your
    // own profile/application) is still a required second layer via an
    // ownership check in the service, same pattern as Interviewer's
    // ownership-scoped permissions (docs/authorization.md §3).
    const roleKeys = isSuperAdmin
      ? [...roles, 'SUPER_ADMIN', 'CANDIDATE']
      : [...roles, 'CANDIDATE'];

    const grant = await this.prisma.rolePermission.findFirst({
      where: {
        role: { key: { in: roleKeys } },
        permission: { key: required.permission },
      },
    });
    if (!grant) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    return true;
  }

  // docs/authorization.md §4: for sensitive/irreversible actions, don't
  // trust the token's roles/isSuperAdmin claims (up to ~15min stale) --
  // re-read the current grant from the DB instead.
  private async reVerifyFromDatabase(
    user: AccessTokenPayload,
  ): Promise<{ isSuperAdmin: boolean; roles: string[] }> {
    const freshUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { isSuperAdmin: true },
    });
    if (!freshUser) {
      throw new UnauthorizedException();
    }

    if (!user.orgId) {
      return { isSuperAdmin: freshUser.isSuperAdmin, roles: [] };
    }

    const memberships = await this.prisma.userOrganizationRole.findMany({
      where: { userId: user.sub, organizationId: user.orgId },
      include: { role: true },
    });
    return {
      isSuperAdmin: freshUser.isSuperAdmin,
      roles: memberships.map((m) => m.role.key),
    };
  }
}
