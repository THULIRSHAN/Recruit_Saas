import path from 'node:path';
import { config } from 'dotenv';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

// Same root .env sharing convention as prisma7.config.ts and main.ts.
config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Platform-defined RBAC catalog -- source of truth is docs/authorization.md
// §3. Roles/permissions are seeded, not user-editable, per that doc.
const RECRUITER_PERMISSIONS = [
  'job:create',
  'job:update',
  'job:publish',
  'job:close',
  // Not in docs/authorization.md §3's table -- see docs/open-questions.md
  // Q17 (a Recruiter who can create/update/publish/close a job obviously
  // needs to be able to view it too).
  'job:read',
  'application:read',
  'application:screen',
  'application:shortlist',
  'pipeline:manage',
  'interview:schedule',
  'interview:read',
];

const HIRING_MANAGER_PERMISSIONS = [
  'application:read',
  'evaluation:read',
  'application:decide',
  'job:read',
];

const INTERVIEWER_PERMISSIONS = ['interview:read', 'evaluation:submit'];

const HR_MANAGER_PERMISSIONS = [
  'offer:create',
  'offer:send',
  'document:request',
  'document:read',
  'onboarding:manage',
];

const CANDIDATE_PERMISSIONS = [
  'application:create',
  'application:withdraw',
  'candidateProfile:update',
  'offer:respond',
  'document:upload',
];

// "all org-scoped permissions below" (Recruiter/Hiring Manager/Interviewer/HR
// Manager), plus the Company-Owner-specific additions.
const COMPANY_OWNER_PERMISSIONS = [
  ...new Set([
    ...RECRUITER_PERMISSIONS,
    ...HIRING_MANAGER_PERMISSIONS,
    ...INTERVIEWER_PERMISSIONS,
    ...HR_MANAGER_PERMISSIONS,
    'organization:update',
    'user:invite',
    'user:remove',
    'subscription:manage',
    'role:assign',
  ]),
];

const SUPER_ADMIN_PERMISSIONS = [
  'organization:approve',
  'organization:reject',
  'organization:suspend',
  'user:manage',
  'subscription:read',
  'payment:read',
  'analytics:platform',
  'auditLog:read',
];

const ROLES: {
  key: string;
  name: string;
  isPlatformRole: boolean;
  permissions: string[];
}[] = [
  {
    key: 'CANDIDATE',
    name: 'Candidate',
    isPlatformRole: false,
    permissions: CANDIDATE_PERMISSIONS,
  },
  {
    key: 'COMPANY_OWNER',
    name: 'Company Owner',
    isPlatformRole: false,
    permissions: COMPANY_OWNER_PERMISSIONS,
  },
  {
    key: 'RECRUITER',
    name: 'Recruiter',
    isPlatformRole: false,
    permissions: RECRUITER_PERMISSIONS,
  },
  {
    key: 'HIRING_MANAGER',
    name: 'Hiring Manager',
    isPlatformRole: false,
    permissions: HIRING_MANAGER_PERMISSIONS,
  },
  {
    key: 'INTERVIEWER',
    name: 'Interviewer',
    isPlatformRole: false,
    permissions: INTERVIEWER_PERMISSIONS,
  },
  {
    key: 'HR_MANAGER',
    name: 'HR Manager',
    isPlatformRole: false,
    permissions: HR_MANAGER_PERMISSIONS,
  },
  {
    key: 'SUPER_ADMIN',
    name: 'Super Admin',
    isPlatformRole: true,
    permissions: SUPER_ADMIN_PERMISSIONS,
  },
];

async function main() {
  const allPermissionKeys = [
    ...new Set(ROLES.flatMap((role) => role.permissions)),
  ];

  const permissionsByKey = new Map<string, string>();
  for (const key of allPermissionKeys) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
    permissionsByKey.set(key, permission.id);
  }

  for (const roleDef of ROLES) {
    const role = await prisma.role.upsert({
      where: { key: roleDef.key },
      update: { name: roleDef.name, isPlatformRole: roleDef.isPlatformRole },
      create: {
        key: roleDef.key,
        name: roleDef.name,
        isPlatformRole: roleDef.isPlatformRole,
      },
    });

    // Reconcile role<->permission mappings by replacing the set wholesale --
    // simpler than diffing, and safe because nothing references
    // RolePermission rows by id.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: roleDef.permissions.map((key) => ({
        roleId: role.id,
        permissionId: permissionsByKey.get(key)!,
      })),
    });
  }

  console.log(
    `Seeded ${permissionsByKey.size} permissions and ${ROLES.length} roles.`,
  );

  await seedSuperAdmin();
}

// Per docs/open-questions.md Q13: no registration flow ever sets
// isSuperAdmin=true (deliberately -- exposing that via an API would be a
// privilege-escalation hole), so the first Super Admin has to come from
// somewhere. Bootstraps one from env vars if provided; a no-op otherwise
// (e.g. CI, or a fresh clone before anyone has set them).
async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log(
      'SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD not set -- skipping Super Admin bootstrap.',
    );
    return;
  }

  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  const passwordHash = await bcrypt.hash(password, saltRounds);

  await prisma.user.upsert({
    where: { email },
    // Kept in sync with the env vars on every reseed, not just created
    // once -- if SUPER_ADMIN_PASSWORD changes, re-running the seed rotates
    // the existing account's password rather than silently ignoring it.
    update: { passwordHash, isSuperAdmin: true },
    create: {
      email,
      passwordHash,
      fullName: 'Super Admin',
      isSuperAdmin: true,
      emailVerified: true,
    },
  });

  console.log(`Seeded Super Admin: ${email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
