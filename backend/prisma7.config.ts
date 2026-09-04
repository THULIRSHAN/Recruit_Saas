import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// One root .env is shared by docker-compose and the backend (see M1.4) —
// load it explicitly rather than the default cwd-relative `.env` lookup,
// so this doesn't silently read a second, divergent copy.
config({ path: path.resolve(process.cwd(), '../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // tsx (not plain `node`): the generated Prisma client's own source uses
    // extensionless relative imports meant for a bundler-style resolver --
    // same reason ts-jest (not native Node) runs the test suite. Node's
    // native type-stripping only erases types, it doesn't do that resolution.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
