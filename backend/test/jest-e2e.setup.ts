import path from 'node:path';
import { config } from 'dotenv';

// e2e tests boot the real AppModule (real PrismaService), so they need the
// same root .env docker-compose and the app itself use — see M1.4/M1.5.
config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
