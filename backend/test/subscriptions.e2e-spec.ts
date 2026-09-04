import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Subscriptions (e2e)', () => {
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
    // guarantee cross-file seed ordering against the shared real DB). Plans
    // themselves come from the real seed script (prisma/seed.ts), run
    // before the suite via the established Docker/native setup -- not
    // re-seeded here, since Plan.key is a platform-defined catalog, not a
    // per-test fixture.
    // No permission grant needed -- used only as the "correct org, wrong
    // permission" 403 test double below.
    await prisma.role.upsert({
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

    await grantPermission(superAdminRole.id, 'organization:approve');
    // Deliberately no subscription:manage -- used for the "correct org,
    // wrong permission" 403 test.

    // Ensure the plan catalog exists even if the real seed script hasn't
    // run against this DB yet (mirrors prisma/seed.ts's PLANS exactly).
    await prisma.plan.upsert({
      where: { key: 'FREE' },
      update: {},
      create: {
        key: 'FREE',
        name: 'Free',
        maxActiveJobs: 3,
        maxSeats: 5,
        priceCents: 0,
      },
    });
    await prisma.plan.upsert({
      where: { key: 'STARTER' },
      update: {},
      create: {
        key: 'STARTER',
        name: 'Starter',
        maxActiveJobs: 20,
        maxSeats: 20,
        priceCents: 4900,
      },
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({
      where: { subscription: { organizationId: { in: orgIdsToClean } } },
    });
    await prisma.subscription.deleteMany({
      where: { organizationId: { in: orgIdsToClean } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: '@subscriptions-e2e.test' } },
    });
    await prisma.organization.deleteMany({
      where: { name: { contains: 'Org Subscriptions E2E Test' } },
    });
    await app.close();
  });

  async function createSuperAdminAndLogin() {
    const email = `super-${Date.now()}-${Math.random().toString(36).slice(2)}@subscriptions-e2e.test`;
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
    const email = `${namePrefix}-owner-${Date.now()}@subscriptions-e2e.test`;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .send({
        organizationName: `Org Subscriptions E2E Test ${namePrefix} ${Date.now()}`,
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
    const email = `staff-${Date.now()}-${Math.random().toString(36).slice(2)}@subscriptions-e2e.test`;
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

  describe('GET /plans', () => {
    it('returns the plan catalog without authentication', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/plans')
        .expect(200);

      const keys = (res.body as Array<{ key: string }>).map((p) => p.key);
      expect(keys).toEqual(expect.arrayContaining(['FREE', 'STARTER']));
    });
  });

  describe('GET /organizations/me/subscription', () => {
    it('returns an empty-shaped subscription before any plan has been selected', async () => {
      const { ownerToken } = await registerAndApproveOrg('GetMineEmpty');

      const res = await request(app.getHttpServer())
        .get('/api/v1/organizations/me/subscription')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body).toEqual({
        id: null,
        status: null,
        currentPeriodEnd: null,
        plan: null,
        payments: [],
      });
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/organizations/me/subscription')
        .expect(401);
    });
  });

  describe('POST /organizations/me/subscription', () => {
    it('selects the FREE plan without a payment record (happy path)', async () => {
      const { ownerToken } = await registerAndApproveOrg('SelectFree');

      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations/me/subscription')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ planKey: 'FREE' })
        .expect(201);

      expect(res.body).toMatchObject({
        status: 'ACTIVE',
        plan: { key: 'FREE', priceCents: 0 },
        payments: [],
      });
    });

    it('selects a paid plan and records a payment', async () => {
      const { ownerToken } = await registerAndApproveOrg('SelectPaid');

      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations/me/subscription')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ planKey: 'STARTER' })
        .expect(201);

      expect(res.body.plan.key).toBe('STARTER');
      expect(res.body.payments).toHaveLength(1);
      expect(res.body.payments[0]).toMatchObject({
        amountCents: 4900,
        status: 'SUCCEEDED',
      });
    });

    it('switches plans in place -- no second Subscription row is created', async () => {
      const { ownerToken } = await registerAndApproveOrg('SwitchPlan');
      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/subscription')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ planKey: 'FREE' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations/me/subscription')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ planKey: 'STARTER' })
        .expect(201);

      expect(res.body.plan.key).toBe('STARTER');
      const count = await prisma.subscription.count({
        where: { organizationId: orgIdsToClean.at(-1) },
      });
      expect(count).toBe(1);
    });

    it('rejects a role without subscription:manage (e.g. Recruiter) with 403', async () => {
      const { orgId } = await registerAndApproveOrg('SelectForbidden');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');

      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/subscription')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ planKey: 'FREE' })
        .expect(403);
    });

    it('rejects an invalid planKey with 400', async () => {
      const { ownerToken } = await registerAndApproveOrg('SelectInvalid');

      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/subscription')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ planKey: 'ENTERPRISE' })
        .expect(400);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/subscription')
        .send({ planKey: 'FREE' })
        .expect(401);
    });
  });
});
