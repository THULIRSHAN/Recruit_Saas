import path from 'node:path';
import { config } from 'dotenv';

// e2e tests boot the real AppModule (real PrismaService), so they need the
// same root .env docker-compose and the app itself use — see M1.4/M1.5.
config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

// Plain assignment (not dotenv), applied after config() so it always wins
// regardless of .env's value: guards run before validation pipes, so the
// e2e suite's realistic-but-rapid legitimate traffic (many logins/registers
// in quick succession, all from the same simulated client) would otherwise
// trip the same per-IP limits meant for real brute-force attempts. See
// AppModule's ThrottlerModule.forRoot skipIf.
process.env.THROTTLE_ENABLED = 'false';
