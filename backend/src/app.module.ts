import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

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
    HealthModule,
    AuthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
