import { execSync } from 'node:child_process';
import path from 'node:path';
import { PrismaService } from '../src/prisma/prisma.service';

// Independently transcribed from docs/authorization.md §3 -- deliberately
// NOT imported from prisma/seed.ts, so this test catches drift between the
// doc and the seed script instead of just re-asserting the seed agrees with
// itself.
const EXPECTED_ROLE_PERMISSIONS: Record<string, string[]> = {
  CANDIDATE: [
    'application:create',
    'application:withdraw',
    'candidateProfile:update',
    'offer:respond',
    'document:upload',
  ],
  RECRUITER: [
    'job:create',
    'job:update',
    'job:publish',
    'job:close',
    'application:read',
    'application:screen',
    'application:shortlist',
    'pipeline:manage',
    'interview:schedule',
    'interview:read',
  ],
  HIRING_MANAGER: [
    'application:read',
    'evaluation:read',
    'application:decide',
    'job:read',
  ],
  INTERVIEWER: ['interview:read', 'evaluation:submit'],
  HR_MANAGER: [
    'offer:create',
    'offer:send',
    'document:request',
    'document:read',
    'onboarding:manage',
  ],
  SUPER_ADMIN: [
    'organization:approve',
    'organization:reject',
    'organization:suspend',
    'user:manage',
    'subscription:read',
    'payment:read',
    'analytics:platform',
    'auditLog:read',
  ],
  // "all org-scoped permissions below" (Recruiter/Hiring Manager/Interviewer/
  // HR Manager) plus the Company-Owner-specific additions.
  COMPANY_OWNER: [
    'job:create',
    'job:update',
    'job:publish',
    'job:close',
    'job:read',
    'application:read',
    'application:screen',
    'application:shortlist',
    'application:decide',
    'pipeline:manage',
    'interview:schedule',
    'interview:read',
    'evaluation:read',
    'evaluation:submit',
    'offer:create',
    'offer:send',
    'document:request',
    'document:read',
    'onboarding:manage',
    'organization:update',
    'user:invite',
    'user:remove',
    'subscription:manage',
    'role:assign',
  ],
};

function sorted(values: string[]): string[] {
  return [...values].sort();
}

function runSeed(): void {
  // execSync (not execFile): needs shell resolution to find npx/npx.cmd
  // across platforms (this project runs on both Windows dev and Linux CI).
  execSync('npx tsx prisma/seed.ts', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe',
  });
}

describe('database seed (e2e)', () => {
  const prisma = new PrismaService();

  beforeAll(async () => {
    await prisma.$connect();
    runSeed();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seeds exactly the roles and permissions defined in docs/authorization.md §3', async () => {
    const roles = await prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
    });

    const actual: Record<string, string[]> = {};
    for (const role of roles) {
      actual[role.key] = sorted(
        role.permissions.map((rp) => rp.permission.key),
      );
    }

    const expected: Record<string, string[]> = {};
    for (const [key, permissions] of Object.entries(
      EXPECTED_ROLE_PERMISSIONS,
    )) {
      expected[key] = sorted(permissions);
    }

    expect(actual).toEqual(expected);
  });

  it('marks SUPER_ADMIN as the only platform role', async () => {
    const platformRoles = await prisma.role.findMany({
      where: { isPlatformRole: true },
    });
    expect(platformRoles.map((role) => role.key)).toEqual(['SUPER_ADMIN']);
  });

  it('is idempotent -- reseeding does not duplicate or change any row', async () => {
    const rolesBefore = await prisma.role.count();
    const permissionsBefore = await prisma.permission.count();
    const mappingsBefore = await prisma.rolePermission.count();

    runSeed();

    expect(await prisma.role.count()).toBe(rolesBefore);
    expect(await prisma.permission.count()).toBe(permissionsBefore);
    expect(await prisma.rolePermission.count()).toBe(mappingsBefore);
  });
});
