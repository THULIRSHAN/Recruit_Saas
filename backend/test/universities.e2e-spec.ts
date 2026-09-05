import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Universities & Partnerships (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const orgIdsToClean: string[] = [];
  const universityIdsToClean: string[] = [];

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
    // No university:partner -- used for the "correct org, wrong
    // permission" 403 test.
    await prisma.role.upsert({
      where: { key: 'RECRUITER' },
      update: {},
      create: { key: 'RECRUITER', name: 'Recruiter' },
    });
    // registerAndApproveOrg() assigns this role to the org owner
    // (OrganizationsService.registerOrganization) -- it needs
    // university:partner to exercise the Company-Owner-facing routes.
    const companyOwnerRole = await prisma.role.upsert({
      where: { key: 'COMPANY_OWNER' },
      update: {},
      create: { key: 'COMPANY_OWNER', name: 'Company Owner' },
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

    await grantPermission(superAdminRole.id, 'organization:approve');
    await grantPermission(superAdminRole.id, 'university:manage');
    await grantPermission(companyOwnerRole.id, 'university:partner');
  });

  afterAll(async () => {
    await prisma.universityPartnership.deleteMany({
      where: { organizationId: { in: orgIdsToClean } },
    });
    await prisma.university.deleteMany({
      where: { id: { in: universityIdsToClean } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: '@universities-e2e.test' } },
    });
    await prisma.organization.deleteMany({
      where: { name: { contains: 'Org Universities E2E Test' } },
    });
    await app.close();
  });

  async function createSuperAdminAndLogin() {
    const email = `super-${Date.now()}-${Math.random().toString(36).slice(2)}@universities-e2e.test`;
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
    const email = `${namePrefix}-owner-${Date.now()}@universities-e2e.test`;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .send({
        organizationName: `Org Universities E2E Test ${namePrefix} ${Date.now()}`,
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

    const ownerToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'password123' })
    ).body.accessToken as string;

    return { orgId, ownerToken };
  }

  async function addStaffAndLogin(orgId: string, roleKey: string) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: roleKey },
    });
    const email = `staff-${Date.now()}-${Math.random().toString(36).slice(2)}@universities-e2e.test`;
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

  async function createUniversity(adminToken: string, name: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/universities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name });
    const id = res.body.id as string;
    universityIdsToClean.push(id);
    return id;
  }

  describe('GET /universities', () => {
    it('returns the catalog without authentication', async () => {
      const adminToken = await createSuperAdminAndLogin();
      await createUniversity(adminToken, `State University ${Date.now()}`);

      const res = await request(app.getHttpServer())
        .get('/api/v1/universities')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /universities', () => {
    it('creates a university (happy path)', async () => {
      const adminToken = await createSuperAdminAndLogin();

      const res = await request(app.getHttpServer())
        .post('/api/v1/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Tech Institute ${Date.now()}` })
        .expect(201);
      universityIdsToClean.push(res.body.id as string);

      expect(res.body.name).toContain('Tech Institute');
    });

    it('returns 409 for a duplicate name', async () => {
      const adminToken = await createSuperAdminAndLogin();
      const name = `Duplicate University ${Date.now()}`;
      await createUniversity(adminToken, name);

      await request(app.getHttpServer())
        .post('/api/v1/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name })
        .expect(409);
    });

    it('rejects a non-Super-Admin with 403', async () => {
      const { orgId } = await registerAndApproveOrg('CreateForbidden');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');

      await request(app.getHttpServer())
        .post('/api/v1/universities')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ name: `Forbidden University ${Date.now()}` })
        .expect(403);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/universities')
        .send({ name: `Unauth University ${Date.now()}` })
        .expect(401);
    });
  });

  describe('POST /organizations/me/partnerships', () => {
    it('creates a partnership with an existing university (happy path)', async () => {
      const adminToken = await createSuperAdminAndLogin();
      const universityId = await createUniversity(
        adminToken,
        `Partner University ${Date.now()}`,
      );
      const { ownerToken } = await registerAndApproveOrg('PartnerHappy');

      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations/me/partnerships')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ universityId })
        .expect(201);

      expect(res.body.university.id).toBe(universityId);
    });

    it('returns 422 for a nonexistent universityId', async () => {
      const { ownerToken } = await registerAndApproveOrg('PartnerBadId');

      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/partnerships')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ universityId: 'does-not-exist' })
        .expect(422);
    });

    it('returns 409 for a duplicate partnership', async () => {
      const adminToken = await createSuperAdminAndLogin();
      const universityId = await createUniversity(
        adminToken,
        `Partner Twice University ${Date.now()}`,
      );
      const { ownerToken } = await registerAndApproveOrg('PartnerTwice');
      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/partnerships')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ universityId });

      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/partnerships')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ universityId })
        .expect(409);
    });

    it('rejects a role without university:partner (e.g. Recruiter) with 403', async () => {
      const adminToken = await createSuperAdminAndLogin();
      const universityId = await createUniversity(
        adminToken,
        `Partner Forbidden University ${Date.now()}`,
      );
      const { orgId } = await registerAndApproveOrg('PartnerForbidden');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');

      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/partnerships')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ universityId })
        .expect(403);
    });
  });

  describe('GET /organizations/me/partnerships', () => {
    it("lists only the caller org's partnerships", async () => {
      const adminToken = await createSuperAdminAndLogin();
      const universityId = await createUniversity(
        adminToken,
        `List University ${Date.now()}`,
      );
      const { ownerToken: ownerTokenA } =
        await registerAndApproveOrg('ListPartnershipsA');
      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/partnerships')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ universityId });
      const { ownerToken: ownerTokenB } =
        await registerAndApproveOrg('ListPartnershipsB');

      const resA = await request(app.getHttpServer())
        .get('/api/v1/organizations/me/partnerships')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .expect(200);
      expect(resA.body).toHaveLength(1);

      const resB = await request(app.getHttpServer())
        .get('/api/v1/organizations/me/partnerships')
        .set('Authorization', `Bearer ${ownerTokenB}`)
        .expect(200);
      expect(resB.body).toHaveLength(0);
    });
  });

  describe('DELETE /organizations/me/partnerships/:universityId', () => {
    it('ends a partnership (happy path)', async () => {
      const adminToken = await createSuperAdminAndLogin();
      const universityId = await createUniversity(
        adminToken,
        `Delete University ${Date.now()}`,
      );
      const { ownerToken } = await registerAndApproveOrg('DeleteHappy');
      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/partnerships')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ universityId });

      await request(app.getHttpServer())
        .delete(`/api/v1/organizations/me/partnerships/${universityId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/api/v1/organizations/me/partnerships')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.body).toHaveLength(0);
    });

    it('returns 404 when no such partnership exists', async () => {
      const { ownerToken } = await registerAndApproveOrg('DeleteMissing');

      await request(app.getHttpServer())
        .delete('/api/v1/organizations/me/partnerships/nonexistent')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });
});
