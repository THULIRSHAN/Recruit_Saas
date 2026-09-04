import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('OrganizationsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

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
    const companyOwnerRole = await prisma.role.upsert({
      where: { key: 'COMPANY_OWNER' },
      update: {},
      create: { key: 'COMPANY_OWNER', name: 'Company Owner' },
    });
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
    await grantPermission(superAdminRole.id, 'organization:reject');
    await grantPermission(companyOwnerRole.id, 'organization:update');
    await grantPermission(companyOwnerRole.id, 'user:invite');
  });

  // Tracked so afterAll can clean up AuditLog rows written by approve/reject
  // (they aren't caught by the name-based Organization cleanup below, since
  // AuditLog rows only carry organizationId, not the org's name).
  const orgIdsToClean: string[] = [];

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        targetType: 'Organization',
        organizationId: { in: orgIdsToClean },
      },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: '@org-e2e.test' } },
    });
    await prisma.organization.deleteMany({
      where: { name: { contains: 'Org E2E Test' } },
    });
    await app.close();
  });

  async function createSuperAdminAndLogin() {
    const email = `super-${Date.now()}-${Math.random().toString(36).slice(2)}@org-e2e.test`;
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

  async function createNonAdminAndLogin() {
    const email = `nonadmin-${Date.now()}-${Math.random().toString(36).slice(2)}@org-e2e.test`;
    const passwordHash = await authService.hashPassword('password123');
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: 'Regular User',
        emailVerified: true,
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    return loginRes.body.accessToken as string;
  }

  async function createPendingOrg(namePrefix: string) {
    const org = await prisma.organization.create({
      data: {
        name: `Org E2E Test ${namePrefix} ${Date.now()}`,
        status: 'PENDING_APPROVAL',
      },
    });
    orgIdsToClean.push(org.id);
    return org;
  }

  async function registerOrgAndLoginOwner(namePrefix: string) {
    const email = `${namePrefix}-owner-${Date.now()}@org-e2e.test`;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .send({
        organizationName: `Org E2E Test ${namePrefix} ${Date.now()}`,
        ownerFullName: 'Org Owner',
        ownerEmail: email,
        ownerPassword: 'password123',
      });
    orgIdsToClean.push(regRes.body.organization.id as string);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    return {
      orgId: regRes.body.organization.id as string,
      token: loginRes.body.accessToken as string,
    };
  }

  async function approveOrg(orgId: string) {
    const adminToken = await createSuperAdminAndLogin();
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
  }

  async function addRecruiterToOrgAndLogin(orgId: string) {
    const recruiterRole = await prisma.role.findUniqueOrThrow({
      where: { key: 'RECRUITER' },
    });
    const email = `recruiter-${Date.now()}-${Math.random().toString(36).slice(2)}@org-e2e.test`;
    const passwordHash = await authService.hashPassword('password123');
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: 'Recruiter Person',
        emailVerified: true,
      },
    });
    await prisma.userOrganizationRole.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        roleId: recruiterRole.id,
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    return loginRes.body.accessToken as string;
  }

  describe('POST /organizations', () => {
    it('registers a new organization with its owner, unauthenticated', async () => {
      const email = `owner-${Date.now()}@org-e2e.test`;

      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .send({
          organizationName: `Org E2E Test ${Date.now()}`,
          ownerFullName: 'Ada Owner',
          ownerEmail: email,
          ownerPassword: 'password123',
        })
        .expect(201);

      expect(res.body.organization).toMatchObject({
        status: 'PENDING_APPROVAL',
      });
      expect(res.body.owner).toMatchObject({ email, fullName: 'Ada Owner' });
      expect(res.body.owner).not.toHaveProperty('passwordHash');

      // Confirms the transaction actually created all three rows together.
      const membership = await prisma.userOrganizationRole.findFirstOrThrow({
        where: {
          userId: res.body.owner.id,
          organizationId: res.body.organization.id,
        },
        include: { role: true },
      });
      expect(membership.role.key).toBe('COMPANY_OWNER');

      const org = await prisma.organization.findUniqueOrThrow({
        where: { id: res.body.organization.id },
      });
      expect(org.status).toBe('PENDING_APPROVAL');
    });

    it('rejects a weak owner password with 400, creating nothing', async () => {
      const email = `weak-${Date.now()}@org-e2e.test`;

      await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .send({
          organizationName: `Org E2E Test ${Date.now()}`,
          ownerFullName: 'Weak Password',
          ownerEmail: email,
          ownerPassword: 'short',
        })
        .expect(400);

      await expect(
        prisma.user.findUnique({ where: { email } }),
      ).resolves.toBeNull();
    });

    it('rejects a missing organizationName with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .send({
          ownerFullName: 'No Org Name',
          ownerEmail: `noorg-${Date.now()}@org-e2e.test`,
          ownerPassword: 'password123',
        })
        .expect(400);
    });

    it('returns a generic 409 on duplicate owner email, and does not create a second organization', async () => {
      const email = `duplicate-${Date.now()}@org-e2e.test`;

      await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .send({
          organizationName: `Org E2E Test First ${Date.now()}`,
          ownerFullName: 'First Owner',
          ownerEmail: email,
          ownerPassword: 'password123',
        })
        .expect(201);

      const orgCountBefore = await prisma.organization.count();

      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .send({
          organizationName: `Org E2E Test Second ${Date.now()}`,
          ownerFullName: 'Second Owner',
          ownerEmail: email,
          ownerPassword: 'password123',
        })
        .expect(409);

      expect(res.body.message).not.toMatch(/email/i);
      // The whole transaction rolled back -- no orphaned Organization row
      // from the failed second attempt.
      await expect(prisma.organization.count()).resolves.toBe(orgCountBefore);
    });

    it('does not require authentication', async () => {
      // Sanity check that @Public() is actually applied -- a request with
      // no Authorization header must not 401 before even reaching validation.
      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .send({});
      expect(res.status).not.toBe(401);
    });
  });

  describe('POST /organizations/:id/approve', () => {
    it('activates a PENDING_APPROVAL organization and writes an AuditLog entry (happy path)', async () => {
      const token = await createSuperAdminAndLogin();
      const org = await createPendingOrg('Approve');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.id}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(res.body).toMatchObject({ id: org.id, status: 'ACTIVE' });

      const updated = await prisma.organization.findUniqueOrThrow({
        where: { id: org.id },
      });
      expect(updated.status).toBe('ACTIVE');
      expect(updated.approvedAt).not.toBeNull();

      const auditLog = await prisma.auditLog.findFirstOrThrow({
        where: { organizationId: org.id, action: 'organization.approved' },
      });
      expect(auditLog.targetType).toBe('Organization');
      expect(auditLog.targetId).toBe(org.id);
    });

    it('rejects an unauthenticated request with 401', async () => {
      const org = await createPendingOrg('Approve401');

      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.id}/approve`)
        .expect(401);
    });

    it('rejects a non-Super-Admin with 403', async () => {
      const token = await createNonAdminAndLogin();
      const org = await createPendingOrg('ApproveForbidden');

      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.id}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await expect(
        prisma.organization.findUniqueOrThrow({ where: { id: org.id } }),
      ).resolves.toMatchObject({ status: 'PENDING_APPROVAL' });
    });

    it('returns 404 for a nonexistent organization id', async () => {
      const token = await createSuperAdminAndLogin();

      await request(app.getHttpServer())
        .post('/api/v1/organizations/does-not-exist/approve')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('returns 409 if the organization is no longer PENDING_APPROVAL', async () => {
      const token = await createSuperAdminAndLogin();
      const org = await createPendingOrg('ApproveConflict');
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.id}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.id}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);
    });
  });

  describe('POST /organizations/:id/reject', () => {
    it('rejects a PENDING_APPROVAL organization with a reason and writes an AuditLog entry (happy path)', async () => {
      const token = await createSuperAdminAndLogin();
      const org = await createPendingOrg('Reject');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.id}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Duplicate signup' })
        .expect(201);

      expect(res.body).toMatchObject({ id: org.id, status: 'REJECTED' });

      const updated = await prisma.organization.findUniqueOrThrow({
        where: { id: org.id },
      });
      expect(updated.rejectedReason).toBe('Duplicate signup');

      const auditLog = await prisma.auditLog.findFirstOrThrow({
        where: { organizationId: org.id, action: 'organization.rejected' },
      });
      expect(auditLog.metadata).toEqual({ reason: 'Duplicate signup' });
    });

    it('rejects a missing reason with 400', async () => {
      const token = await createSuperAdminAndLogin();
      const org = await createPendingOrg('RejectNoReason');

      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.id}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      await expect(
        prisma.organization.findUniqueOrThrow({ where: { id: org.id } }),
      ).resolves.toMatchObject({ status: 'PENDING_APPROVAL' });
    });

    it('rejects a non-Super-Admin with 403', async () => {
      const token = await createNonAdminAndLogin();
      const org = await createPendingOrg('RejectForbidden');

      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.id}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'nope' })
        .expect(403);
    });
  });

  describe('GET /organizations', () => {
    it('returns a paginated list, filterable by status, for a Super Admin', async () => {
      const token = await createSuperAdminAndLogin();
      const org = await createPendingOrg('List');

      const res = await request(app.getHttpServer())
        .get('/api/v1/organizations')
        .query({ status: 'PENDING_APPROVAL', page: 1, pageSize: 5 })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 5 });
      expect(
        (res.body.data as Array<{ id: string }>).some((o) => o.id === org.id),
      ).toBe(true);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/organizations')
        .expect(401);
    });

    it('rejects a non-Super-Admin with 403', async () => {
      const token = await createNonAdminAndLogin();

      await request(app.getHttpServer())
        .get('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('GET /organizations/me', () => {
    it("returns the caller's own organization, including while still PENDING_APPROVAL", async () => {
      const { orgId, token } = await registerOrgAndLoginOwner('GetMinePending');

      const res = await request(app.getHttpServer())
        .get('/api/v1/organizations/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({ id: orgId, status: 'PENDING_APPROVAL' });
    });

    it('is visible to any org-scoped role, not just the Company Owner', async () => {
      const { orgId } = await registerOrgAndLoginOwner('GetMineRecruiter');
      await approveOrg(orgId);
      const recruiterToken = await addRecruiterToOrgAndLogin(orgId);

      const res = await request(app.getHttpServer())
        .get('/api/v1/organizations/me')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      expect(res.body).toMatchObject({ id: orgId, status: 'ACTIVE' });
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/organizations/me')
        .expect(401);
    });

    it('returns 404 when the caller has no organization in their token', async () => {
      const token = await createNonAdminAndLogin();

      await request(app.getHttpServer())
        .get('/api/v1/organizations/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PATCH /organizations/me', () => {
    it("updates the caller's own ACTIVE organization's name (happy path)", async () => {
      const { orgId, token } = await registerOrgAndLoginOwner('PatchMine');
      await approveOrg(orgId);

      const res = await request(app.getHttpServer())
        .patch('/api/v1/organizations/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Org E2E Test Renamed' })
        .expect(200);

      expect(res.body).toMatchObject({ name: 'Org E2E Test Renamed' });
      await expect(
        prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
      ).resolves.toMatchObject({ name: 'Org E2E Test Renamed' });
    });

    it('rejects an empty name with 400', async () => {
      const { orgId, token } =
        await registerOrgAndLoginOwner('PatchMineInvalid');
      await approveOrg(orgId);

      await request(app.getHttpServer())
        .patch('/api/v1/organizations/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' })
        .expect(400);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/organizations/me')
        .send({ name: 'Nope' })
        .expect(401);
    });

    it('rejects a role without organization:update (e.g. Recruiter) with 403', async () => {
      const { orgId } = await registerOrgAndLoginOwner('PatchMineForbidden');
      await approveOrg(orgId);
      const recruiterToken = await addRecruiterToOrgAndLogin(orgId);

      await request(app.getHttpServer())
        .patch('/api/v1/organizations/me')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ name: 'Hijacked Name' })
        .expect(403);
    });

    it('returns 409 if the organization is not yet ACTIVE', async () => {
      const { token } = await registerOrgAndLoginOwner('PatchMinePending');

      await request(app.getHttpServer())
        .patch('/api/v1/organizations/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Too Soon' })
        .expect(409);
    });
  });

  describe('POST /organizations/me/invitations', () => {
    it('creates an invitation for an ACTIVE org and a valid role (happy path)', async () => {
      const { orgId, token } = await registerOrgAndLoginOwner('InviteHappy');
      await approveOrg(orgId);
      const email = `invitee-${Date.now()}@org-e2e.test`;

      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations/me/invitations')
        .set('Authorization', `Bearer ${token}`)
        .send({ email, roleKey: 'RECRUITER' })
        .expect(201);

      expect(res.body).toMatchObject({
        email,
        role: { key: 'RECRUITER', name: 'Recruiter' },
      });
      expect(res.body).not.toHaveProperty('tokenHash');
      expect(res.body).not.toHaveProperty('token');

      const stored = await prisma.invitation.findUniqueOrThrow({
        where: { id: res.body.id as string },
      });
      expect(stored.organizationId).toBe(orgId);
      expect(stored.acceptedAt).toBeNull();
    });

    it('rejects an invalid email with 400', async () => {
      const { orgId, token } = await registerOrgAndLoginOwner('InviteBadEmail');
      await approveOrg(orgId);

      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/invitations')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'not-an-email', roleKey: 'RECRUITER' })
        .expect(400);

      await expect(
        prisma.invitation.findFirst({ where: { organizationId: orgId } }),
      ).resolves.toBeNull();
    });

    it('rejects an unknown role key with 400', async () => {
      const { orgId, token } = await registerOrgAndLoginOwner('InviteBadRole');
      await approveOrg(orgId);

      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/invitations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: `invitee-${Date.now()}@org-e2e.test`,
          roleKey: 'NOT_A_REAL_ROLE',
        })
        .expect(400);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/invitations')
        .send({ email: 'someone@org-e2e.test', roleKey: 'RECRUITER' })
        .expect(401);
    });

    it('rejects a role without user:invite (e.g. Recruiter) with 403', async () => {
      const { orgId } = await registerOrgAndLoginOwner('InviteForbidden');
      await approveOrg(orgId);
      const recruiterToken = await addRecruiterToOrgAndLogin(orgId);

      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/invitations')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          email: `invitee-${Date.now()}@org-e2e.test`,
          roleKey: 'RECRUITER',
        })
        .expect(403);
    });

    it('returns 409 if the organization is not yet ACTIVE', async () => {
      const { token } = await registerOrgAndLoginOwner('InvitePending');

      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/invitations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: `invitee-${Date.now()}@org-e2e.test`,
          roleKey: 'RECRUITER',
        })
        .expect(409);
    });

    it('returns 409 for a duplicate pending invitation to the same email and role', async () => {
      const { orgId, token } = await registerOrgAndLoginOwner('InviteDup');
      await approveOrg(orgId);
      const email = `invitee-${Date.now()}@org-e2e.test`;

      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/invitations')
        .set('Authorization', `Bearer ${token}`)
        .send({ email, roleKey: 'RECRUITER' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/invitations')
        .set('Authorization', `Bearer ${token}`)
        .send({ email, roleKey: 'RECRUITER' })
        .expect(409);
    });

    it('returns 409 if the invited email already holds that role at the org', async () => {
      const { orgId, token } = await registerOrgAndLoginOwner(
        'InviteAlreadyMember',
      );
      await approveOrg(orgId);
      // Adds a Recruiter who's already a RECRUITER at this org.
      await addRecruiterToOrgAndLogin(orgId);
      const recruiterUser = await prisma.userOrganizationRole.findFirstOrThrow({
        where: { organizationId: orgId, role: { key: 'RECRUITER' } },
        include: { user: true },
      });

      await request(app.getHttpServer())
        .post('/api/v1/organizations/me/invitations')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: recruiterUser.user.email, roleKey: 'RECRUITER' })
        .expect(409);
    });
  });
});
