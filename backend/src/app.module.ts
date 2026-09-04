import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApplicationsModule } from './applications/applications.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { TenantGuard } from './auth/guards/tenant.guard';
import { CandidatesModule } from './candidates/candidates.module';
import { HealthModule } from './health/health.module';
import { InterviewsModule } from './interviews/interviews.module';
import { JobsModule } from './jobs/jobs.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PipelineTemplatesModule } from './pipeline-templates/pipeline-templates.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    // Generous global default (docs/security.md §7 wants this eventually
    // applied broadly, e.g. future public endpoints like job search); the
    // sensitive auth endpoints (login/register/forgot-password) override it
    // with a tighter limit directly via @Throttle -- see AuthController.
    // HealthController opts out entirely via @SkipThrottle since Docker's
    // healthcheck polls it continuously by design.
    //
    // THROTTLE_ENABLED=false (set by test/jest-e2e.setup.ts) disables
    // enforcement entirely: guards run before validation pipes, so an e2e
    // suite's realistic-but-rapid legitimate traffic (many logins/registers
    // in quick succession, all from the same simulated client) would
    // otherwise trip the same limits meant for real brute-force attempts.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 20 }],
      skipIf: () => process.env.THROTTLE_ENABLED === 'false',
    }),
    PrismaModule,
    StorageModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    JobsModule,
    PipelineTemplatesModule,
    CandidatesModule,
    ApplicationsModule,
    InterviewsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Secure by default (docs/authorization.md): every route requires a
    // valid access token unless explicitly marked @Public(). Registered
    // after ThrottlerGuard so unauthenticated flooding gets rate-limited
    // before it reaches token verification.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // No-ops unless a route carries @RequirePermission(...) -- global so a
    // developer can't forget to apply it (multi-tenancy.md §4's "mechanism,
    // not policy" principle). Runs after JwtAuthGuard, which populates
    // req.user that this guard depends on.
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // No-ops unless a route carries @RequireTenant(...) -- same reasoning
    // as PermissionsGuard. Defense-in-depth only (multi-tenancy.md §3):
    // the service layer's own organizationId filter is the authoritative
    // check, this just 404s a cross-tenant request before the handler runs.
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
export class AppModule {}
