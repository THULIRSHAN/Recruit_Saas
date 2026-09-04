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
    // Q21 (docs/open-questions.md): not in authorization.md §3's original
    // table, but REQ-APP-001 requires a candidate to be able to read back
    // their own application.
    'application:read',
    'application:withdraw',
    'candidateProfile:update',
    // Q26 (docs/open-questions.md): not in authorization.md §3's original
    // table, but a candidate needs to view an offer before REQ-OFFER-002's
    // accept/decline action makes sense.
    'offer:read',
    'offer:respond',
    // Q27 (docs/open-questions.md): a new permission (not a missing grant
    // of an existing one) -- a candidate needs to view their own
    // onboarding checklist to know what to upload.
    'onboarding:read',
    'document:upload',
  ],
  RECRUITER: [
    'job:create',
    'job:update',
    'job:publish',
    'job:close',
    // docs/open-questions.md Q17 -- not in authorization.md's original
    // table, added as a documented fix.
    'job:read',
    'application:read',
    'application:screen',
    'application:shortlist',
    'pipeline:manage',
    'interview:schedule',
    'interview:read',
    // docs/open-questions.md Q24 -- not in authorization.md's original
    // table, added as a documented fix (REQ-EVAL-002 names Recruiter as
    // an actor for the aggregate evaluation view).
    'evaluation:read',
    // Q30 (docs/open-questions.md): a new permission (not a missing grant
    // of an existing one) -- no key in the original catalog covered
    // talent pools at all.
    'talentPool:manage',
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
    // Q26 (docs/open-questions.md): not in authorization.md §3's original
    // table, added as a documented fix.
    'offer:read',
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
    'talentPool:manage',
    'offer:create',
    'offer:read',
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

function runSeed(extraEnv: Record<string, string> = {}): void {
  // execSync (not execFile): needs shell resolution to find npx/npx.cmd
  // across platforms (this project runs on both Windows dev and Linux CI).
  execSync('npx tsx prisma/seed.ts', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe',
    env: { ...process.env, ...extraEnv },
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

  describe('Super Admin bootstrap (docs/open-questions.md Q13)', () => {
    // Explicit env vars per test, not relying on ambient .env state -- CI
    // doesn't set these (each e2e file seeds its own fixtures instead), so
    // a test depending on the ambient environment would pass locally and
    // fail in CI.
    const email = `test-super-admin-${Date.now()}@example.com`;

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email } });
    });

    it('creates a Super Admin user when the env vars are provided', async () => {
      runSeed({
        SUPER_ADMIN_EMAIL: email,
        SUPER_ADMIN_PASSWORD: 'testpassword123',
      });

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.isSuperAdmin).toBe(true);
      expect(user.emailVerified).toBe(true);
      expect(user.passwordHash).not.toBe('testpassword123');
    });

    it('is idempotent and rotates the password hash on reseed, without creating a duplicate', async () => {
      const before = await prisma.user.findUniqueOrThrow({ where: { email } });

      runSeed({
        SUPER_ADMIN_EMAIL: email,
        SUPER_ADMIN_PASSWORD: 'a-different-password456',
      });

      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.id).toBe(before.id);
      expect(after.passwordHash).not.toBe(before.passwordHash);
      await expect(prisma.user.count({ where: { email } })).resolves.toBe(1);
    });

    it('does not create or change any Super Admin when the env vars are absent', async () => {
      // Scoped to this test file's own fixture user, not a global
      // isSuperAdmin:true query -- other e2e files (e.g.
      // organizations.e2e-spec.ts) create their own Super Admin fixtures
      // concurrently against the same shared real DB, so a global snapshot
      // here would be a latent cross-file flake, not a guarantee.
      const before = await prisma.user.findUniqueOrThrow({ where: { email } });

      // Explicitly unset (rather than just omitting from extraEnv) so this
      // doesn't accidentally inherit a real ambient SUPER_ADMIN_EMAIL.
      const env = { ...process.env };
      delete env.SUPER_ADMIN_EMAIL;
      delete env.SUPER_ADMIN_PASSWORD;
      execSync('npx tsx prisma/seed.ts', {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'pipe',
        env,
      });

      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.isSuperAdmin).toBe(true);
    });
  });
});
