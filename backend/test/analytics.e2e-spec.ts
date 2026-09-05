import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const orgIdsToClean: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    authService = app.get(AuthService);

    // This file's own fixture -- see auth.e2e-spec.ts for why (Jest doesn't
    // guarantee cross-file seed ordering against the shared real DB).
    const recruiterRole = await prisma.role.upsert({
      where: { key: 'RECRUITER' },
      update: {},
      create: { key: 'RECRUITER', name: 'Recruiter' },
    });
    // No analytics:read -- used for the "correct org, wrong permission"
    // 403 test.
    const hiringManagerRole = await prisma.role.upsert({
      where: { key: 'HIRING_MANAGER' },
      update: {},
      create: { key: 'HIRING_MANAGER', name: 'Hiring Manager' },
    });
    const superAdminRole = await prisma.role.upsert({
      where: { key: 'SUPER_ADMIN' },
      update: {},
      create: { key: 'SUPER_ADMIN', name: 'Super Admin', isPlatformRole: true },
    });

    async function grantPermission(roleId: string, key: string) {
      const permission = await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key },
      });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permission.id } },
        update: {},
        create: { roleId, permissionId: permission.id },
      });
    }

    async function revokePermission(roleId: string, key: string) {
      const permission = await prisma.permission.findUnique({ where: { key } });
      if (!permission) return;
      await prisma.rolePermission.deleteMany({
        where: { roleId, permissionId: permission.id },
      });
    }

    // Global roles are shared with every other e2e file and the real seed
    // script against this same DB (Jest doesn't guarantee cross-file/cross-
    // run ordering) -- a prior run granting HIRING_MANAGER analytics:read
    // (e.g. via database.e2e-spec.ts exercising the seed script) would
    // otherwise leak into this file's "wrong permission" 403 test.
    await revokePermission(hiringManagerRole.id, 'analytics:read');

    await grantPermission(superAdminRole.id, 'organization:approve');
    await grantPermission(superAdminRole.id, 'analytics:platform');
    await grantPermission(recruiterRole.id, 'job:create');
    await grantPermission(recruiterRole.id, 'job:publish');
    await grantPermission(recruiterRole.id, 'pipeline:manage');
    await grantPermission(recruiterRole.id, 'analytics:read');
  });

  afterAll(async () => {
    await prisma.recruitmentStage.deleteMany({
      where: { job: { organizationId: { in: orgIdsToClean } } },
    });
    await prisma.job.deleteMany({
      where: { organizationId: { in: orgIdsToClean } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: '@analytics-e2e.test' } },
    });
    await prisma.organization.deleteMany({
      where: { name: { contains: 'Org Analytics E2E Test' } },
    });
    await app.close();
  });

  async function createSuperAdminAndLogin() {
    const email = `super-${Date.now()}-${Math.random().toString(36).slice(2)}@analytics-e2e.test`;
    const passwordHash = await authService.hashPassword('password123');
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: 'Test Super Admin',
        isSuperAdmin: true,
        emailVerified: true,
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    return loginRes.body.accessToken as string;
  }

  async function registerAndApproveOrg(namePrefix: string) {
    const email = `${namePrefix}-owner-${Date.now()}@analytics-e2e.test`;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .send({
        organizationName: `Org Analytics E2E Test ${namePrefix} ${Date.now()}`,
        ownerFullName: 'Org Owner',
        ownerEmail: email,
        ownerPassword: 'password123',
      });
    const orgId = regRes.body.organization.id as string;
    orgIdsToClean.push(orgId);

    const adminToken = await createSuperAdminAndLogin();
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    return orgId;
  }

  async function addStaffAndLogin(orgId: string, roleKey: string) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: roleKey },
    });
    const email = `staff-${Date.now()}-${Math.random().toString(36).slice(2)}@analytics-e2e.test`;
    const passwordHash = await authService.hashPassword('password123');
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: 'Staff Person',
        emailVerified: true,
      },
    });
    await prisma.userOrganizationRole.create({
      data: { userId: user.id, organizationId: orgId, roleId: role.id },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    return loginRes.body.accessToken as string;
  }

  describe('GET /organizations/me/analytics', () => {
    it("returns funnel counts for the caller's own org (happy path)", async () => {
      const orgId = await registerAndApproveOrg('OrgHappy');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobRes = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ title: 'Software Engineer', description: 'Build things.' });
      await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobRes.body.id}/stages`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ stages: ['Applied'] });
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobRes.body.id}/publish`)
        .set('Authorization', `Bearer ${recruiterToken}`);

      const res = await request(app.getHttpServer())
        .get('/api/v1/organizations/me/analytics')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      expect(res.body.jobs.total).toBeGreaterThanOrEqual(1);
      expect(res.body.jobs.byStatus.PUBLISHED).toBeGreaterThanOrEqual(1);
      expect(res.body).toHaveProperty('applications');
      expect(res.body).toHaveProperty('interviews');
      expect(res.body).toHaveProperty('offers');
    });

    it("scopes counts to the caller's own org, not other orgs", async () => {
      const orgIdA = await registerAndApproveOrg('OrgScopeA');
      const recruiterTokenA = await addStaffAndLogin(orgIdA, 'RECRUITER');
      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${recruiterTokenA}`)
        .send({ title: 'Software Engineer', description: 'Build things.' });

      const orgIdB = await registerAndApproveOrg('OrgScopeB');
      const recruiterTokenB = await addStaffAndLogin(orgIdB, 'RECRUITER');

      const res = await request(app.getHttpServer())
        .get('/api/v1/organizations/me/analytics')
        .set('Authorization', `Bearer ${recruiterTokenB}`)
        .expect(200);

      expect(res.body.jobs.total).toBe(0);
    });

    it('rejects a role without analytics:read (e.g. Hiring Manager) with 403', async () => {
      const orgId = await registerAndApproveOrg('OrgForbidden');
      const hmToken = await addStaffAndLogin(orgId, 'HIRING_MANAGER');

      await request(app.getHttpServer())
        .get('/api/v1/organizations/me/analytics')
        .set('Authorization', `Bearer ${hmToken}`)
        .expect(403);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/organizations/me/analytics')
        .expect(401);
    });
  });

  describe('GET /admin/analytics', () => {
    it('returns platform-wide counts (happy path)', async () => {
      const adminToken = await createSuperAdminAndLogin();

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('organizations');
      expect(res.body).toHaveProperty('jobs');
      expect(res.body).toHaveProperty('applications');
      expect(res.body).toHaveProperty('subscriptions');
      expect(res.body.organizations.total).toBeGreaterThanOrEqual(1);
    });

    it('rejects a non-Super-Admin with 403', async () => {
      const orgId = await registerAndApproveOrg('AdminForbidden');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');

      await request(app.getHttpServer())
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(403);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/analytics')
        .expect(401);
    });
  });
});
