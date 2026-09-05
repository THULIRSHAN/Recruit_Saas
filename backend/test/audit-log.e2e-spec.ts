import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AuditLog (e2e)', () => {
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

    // Same rationale as analytics.e2e-spec.ts -- a prior run granting
    // Recruiter auditLog:read would otherwise leak into the 403 test.
    await revokePermission(recruiterRole.id, 'auditLog:read');

    await grantPermission(superAdminRole.id, 'organization:approve');
    await grantPermission(superAdminRole.id, 'auditLog:read');
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { organizationId: { in: orgIdsToClean } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: '@audit-e2e.test' } },
    });
    await prisma.organization.deleteMany({
      where: { name: { contains: 'Org Audit E2E Test' } },
    });
    await app.close();
  });

  async function createSuperAdminAndLogin() {
    const email = `super-${Date.now()}-${Math.random().toString(36).slice(2)}@audit-e2e.test`;
    const passwordHash = await authService.hashPassword('password123');
    const admin = await prisma.user.create({
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
    return { admin, token: loginRes.body.accessToken as string };
  }

  async function registerAndApproveOrg(namePrefix: string, adminToken: string) {
    const email = `${namePrefix}-owner-${Date.now()}@audit-e2e.test`;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .send({
        organizationName: `Org Audit E2E Test ${namePrefix} ${Date.now()}`,
        ownerFullName: 'Org Owner',
        ownerEmail: email,
        ownerPassword: 'password123',
      });
    const orgId = regRes.body.organization.id as string;
    orgIdsToClean.push(orgId);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    return orgId;
  }

  async function addStaffAndLogin(orgId: string, roleKey: string) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: roleKey },
    });
    const email = `staff-${Date.now()}-${Math.random().toString(36).slice(2)}@audit-e2e.test`;
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

  describe('GET /admin/audit-log', () => {
    it('returns entries newest-first with the actor and organization resolved (happy path)', async () => {
      const { admin, token } = await createSuperAdminAndLogin();
      const orgId = await registerAndApproveOrg('Happy', token);

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-log')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const entry = (
        res.body.data as Array<{ targetType: string; targetId: string }>
      ).find((e) => e.targetType === 'Organization' && e.targetId === orgId);
      expect(entry).toMatchObject({
        action: 'organization.approved',
        actor: { id: admin.id, email: admin.email },
        organization: { id: orgId },
      });
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 20 });
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('respects page/pageSize', async () => {
      const { token } = await createSuperAdminAndLogin();

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-log')
        .query({ page: 1, pageSize: 1 })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.length).toBeLessThanOrEqual(1);
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 1 });
    });

    it('rejects a non-Super-Admin with 403', async () => {
      const { token } = await createSuperAdminAndLogin();
      const orgId = await registerAndApproveOrg('Forbidden', token);
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');

      await request(app.getHttpServer())
        .get('/api/v1/admin/audit-log')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(403);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/audit-log')
        .expect(401);
    });
  });
});
