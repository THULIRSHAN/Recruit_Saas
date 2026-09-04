import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Offers (e2e)', () => {
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
    const hiringManagerRole = await prisma.role.upsert({
      where: { key: 'HIRING_MANAGER' },
      update: {},
      create: { key: 'HIRING_MANAGER', name: 'Hiring Manager' },
    });
    const hrManagerRole = await prisma.role.upsert({
      where: { key: 'HR_MANAGER' },
      update: {},
      create: { key: 'HR_MANAGER', name: 'HR Manager' },
    });
    const candidateRole = await prisma.role.upsert({
      where: { key: 'CANDIDATE' },
      update: {},
      create: { key: 'CANDIDATE', name: 'Candidate' },
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
    await grantPermission(recruiterRole.id, 'job:create');
    await grantPermission(recruiterRole.id, 'job:publish');
    await grantPermission(recruiterRole.id, 'pipeline:manage');
    await grantPermission(hiringManagerRole.id, 'application:decide');
    await grantPermission(hrManagerRole.id, 'offer:create');
    await grantPermission(hrManagerRole.id, 'offer:read');
    await grantPermission(candidateRole.id, 'application:create');
    await grantPermission(candidateRole.id, 'candidateProfile:update');
    await grantPermission(candidateRole.id, 'offer:read');
    await grantPermission(candidateRole.id, 'offer:respond');
  });

  afterAll(async () => {
    // Offer has no onDelete: Cascade from Application, so it must be
    // deleted first.
    await prisma.offer.deleteMany({
      where: { organizationId: { in: orgIdsToClean } },
    });
    await prisma.application.deleteMany({
      where: { organizationId: { in: orgIdsToClean } },
    });
    await prisma.recruitmentStage.deleteMany({
      where: { job: { organizationId: { in: orgIdsToClean } } },
    });
    await prisma.job.deleteMany({
      where: { organizationId: { in: orgIdsToClean } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: '@offers-e2e.test' } },
    });
    await prisma.organization.deleteMany({
      where: { name: { contains: 'Org Offers E2E Test' } },
    });
    await app.close();
  });

  async function createSuperAdminAndLogin() {
    const email = `super-${Date.now()}-${Math.random().toString(36).slice(2)}@offers-e2e.test`;
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
    const email = `${namePrefix}-owner-${Date.now()}@offers-e2e.test`;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .send({
        organizationName: `Org Offers E2E Test ${namePrefix} ${Date.now()}`,
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
    const email = `staff-${Date.now()}-${Math.random().toString(36).slice(2)}@offers-e2e.test`;
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

  async function createPublishedJob(recruiterToken: string) {
    const jobRes = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ title: 'Software Engineer', description: 'Build things.' });
    const jobId = jobRes.body.id as string;
    await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/stages`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ stages: ['Applied', 'Interview'] });
    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/publish`)
      .set('Authorization', `Bearer ${recruiterToken}`);
    return jobId;
  }

  async function registerCandidateAndLogin(namePrefix: string) {
    const email = `${namePrefix}-${Date.now()}@offers-e2e.test`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', fullName: 'Test Candidate' });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    return loginRes.body.accessToken as string;
  }

  async function uploadCv(candidateToken: string) {
    await request(app.getHttpServer())
      .post('/api/v1/candidates/me/cvs')
      .set('Authorization', `Bearer ${candidateToken}`)
      .attach('file', Buffer.from('%PDF-1.4\n%mock cv'), 'resume.pdf');
  }

  async function applyToJob(candidateToken: string, jobId: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({ jobId });
    return res.body.id as string;
  }

  // Bootstraps org + published job + a HIRED application, the common
  // precondition every offer test needs (REQ-OFFER-001).
  async function setUpHiredApplication(namePrefix: string) {
    const orgId = await registerAndApproveOrg(namePrefix);
    const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');
    const jobId = await createPublishedJob(recruiterToken);
    const candidateToken = await registerCandidateAndLogin(namePrefix);
    await uploadCv(candidateToken);
    const applicationId = await applyToJob(candidateToken, jobId);
    const hmToken = await addStaffAndLogin(orgId, 'HIRING_MANAGER');
    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/decide`)
      .set('Authorization', `Bearer ${hmToken}`)
      .send({ decision: 'HIRE' });
    const hrToken = await addStaffAndLogin(orgId, 'HR_MANAGER');
    return { orgId, jobId, applicationId, candidateToken, hrToken };
  }

  function futureIso(daysFromNow: number) {
    return new Date(
      Date.now() + daysFromNow * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  describe('POST /jobs/:jobId/applications/:id/offer', () => {
    it('creates an offer for a HIRED application (happy path)', async () => {
      const { jobId, applicationId, hrToken } =
        await setUpHiredApplication('CreateHappy');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          title: 'Software Engineer',
          compensation: '$120,000/yr',
          expiresAt: futureIso(14),
        })
        .expect(201);

      expect(res.body).toMatchObject({
        title: 'Software Engineer',
        compensation: '$120,000/yr',
        status: 'SENT',
      });
    });

    it('returns 409 for a non-HIRED application', async () => {
      const orgId = await registerAndApproveOrg('CreateNotHired');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('CreateNotHired');
      await uploadCv(candidateToken);
      const applicationId = await applyToJob(candidateToken, jobId);
      const hrToken = await addStaffAndLogin(orgId, 'HR_MANAGER');

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ title: 'Software Engineer', expiresAt: futureIso(14) })
        .expect(409);
    });

    it('returns 400 when expiresAt is in the past', async () => {
      const { jobId, applicationId, hrToken } =
        await setUpHiredApplication('CreatePastExpiry');

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ title: 'Software Engineer', expiresAt: futureIso(-1) })
        .expect(400);
    });

    it('returns 409 for a second offer on the same application', async () => {
      const { jobId, applicationId, hrToken } =
        await setUpHiredApplication('CreateTwice');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ title: 'Software Engineer', expiresAt: futureIso(14) });

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ title: 'Software Engineer', expiresAt: futureIso(14) })
        .expect(409);
    });

    it('rejects a role without offer:create (e.g. Recruiter) with 403', async () => {
      const { orgId, jobId, applicationId } =
        await setUpHiredApplication('CreateForbidden');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ title: 'Software Engineer', expiresAt: futureIso(14) })
        .expect(403);
    });

    it('returns 404 for a job belonging to another organization', async () => {
      const { applicationId } = await setUpHiredApplication('CreateCrossA');
      const orgIdB = await registerAndApproveOrg('CreateCrossB');
      const recruiterTokenB = await addStaffAndLogin(orgIdB, 'RECRUITER');
      const jobIdB = await createPublishedJob(recruiterTokenB);
      const hrTokenB = await addStaffAndLogin(orgIdB, 'HR_MANAGER');

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobIdB}/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${hrTokenB}`)
        .send({ title: 'Software Engineer', expiresAt: futureIso(14) })
        .expect(404);
    });

    it('rejects an unauthenticated request with 401', async () => {
      const { jobId, applicationId } =
        await setUpHiredApplication('CreateUnauth');

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
        .send({ title: 'Software Engineer', expiresAt: futureIso(14) })
        .expect(401);
    });
  });

  describe('GET /applications/:id/offer', () => {
    it("returns the candidate's own offer (happy path)", async () => {
      const { jobId, applicationId, hrToken, candidateToken } =
        await setUpHiredApplication('GetMineHappy');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ title: 'Software Engineer', expiresAt: futureIso(14) });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .expect(200);

      expect(res.body.status).toBe('SENT');
    });

    it("returns 404 for another candidate's application", async () => {
      const { jobId, applicationId, hrToken } =
        await setUpHiredApplication('GetMineCross');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ title: 'Software Engineer', expiresAt: futureIso(14) });
      const otherCandidateToken =
        await registerCandidateAndLogin('GetMineCrossOther');

      await request(app.getHttpServer())
        .get(`/api/v1/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${otherCandidateToken}`)
        .expect(404);
    });
  });

  describe('POST /applications/:id/offer/respond', () => {
    it('ACCEPT sets an ACCEPTED status (happy path)', async () => {
      const { jobId, applicationId, hrToken, candidateToken } =
        await setUpHiredApplication('RespondAccept');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ title: 'Software Engineer', expiresAt: futureIso(14) });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationId}/offer/respond`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ decision: 'ACCEPT' })
        .expect(201);

      expect(res.body.status).toBe('ACCEPTED');
    });

    it('DECLINE sets a DECLINED status', async () => {
      const { jobId, applicationId, hrToken, candidateToken } =
        await setUpHiredApplication('RespondDecline');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ title: 'Software Engineer', expiresAt: futureIso(14) });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationId}/offer/respond`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ decision: 'DECLINE' })
        .expect(201);

      expect(res.body.status).toBe('DECLINED');
    });

    it('returns 409 when responding twice', async () => {
      const { jobId, applicationId, hrToken, candidateToken } =
        await setUpHiredApplication('RespondTwice');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ title: 'Software Engineer', expiresAt: futureIso(14) });
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationId}/offer/respond`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ decision: 'ACCEPT' });

      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationId}/offer/respond`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ decision: 'DECLINE' })
        .expect(409);
    });

    it('returns 409 for an expired offer', async () => {
      const { jobId, applicationId, hrToken, candidateToken, orgId } =
        await setUpHiredApplication('RespondExpired');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ title: 'Software Engineer', expiresAt: futureIso(14) });
      // Force the offer into the past directly -- there is no API surface
      // for backdating expiresAt, and the lazy-expiry check only needs a
      // SENT offer whose expiresAt has already elapsed.
      await prisma.offer.updateMany({
        where: { organizationId: orgId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationId}/offer/respond`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ decision: 'ACCEPT' })
        .expect(409);
    });

    it('rejects an unauthenticated request with 401', async () => {
      const { applicationId } = await setUpHiredApplication('RespondUnauth');

      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationId}/offer/respond`)
        .send({ decision: 'ACCEPT' })
        .expect(401);
    });
  });
});
