import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Onboarding (e2e)', () => {
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
    await grantPermission(hrManagerRole.id, 'onboarding:manage');
    await grantPermission(hrManagerRole.id, 'document:request');
    await grantPermission(candidateRole.id, 'application:create');
    await grantPermission(candidateRole.id, 'candidateProfile:update');
    await grantPermission(candidateRole.id, 'offer:read');
    await grantPermission(candidateRole.id, 'offer:respond');
    await grantPermission(candidateRole.id, 'onboarding:read');
    await grantPermission(candidateRole.id, 'document:upload');
  });

  afterAll(async () => {
    // Document -> OnboardingTask -> OnboardingChecklist -> Offer, none of
    // which cascade from Application -- delete in dependency order.
    await prisma.document.deleteMany({
      where: {
        task: {
          checklist: { offer: { organizationId: { in: orgIdsToClean } } },
        },
      },
    });
    await prisma.onboardingTask.deleteMany({
      where: {
        checklist: { offer: { organizationId: { in: orgIdsToClean } } },
      },
    });
    await prisma.onboardingChecklist.deleteMany({
      where: { offer: { organizationId: { in: orgIdsToClean } } },
    });
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
      where: { email: { contains: '@onboarding-e2e.test' } },
    });
    await prisma.organization.deleteMany({
      where: { name: { contains: 'Org Onboarding E2E Test' } },
    });
    await app.close();
  });

  async function createSuperAdminAndLogin() {
    const email = `super-${Date.now()}-${Math.random().toString(36).slice(2)}@onboarding-e2e.test`;
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
    const email = `${namePrefix}-owner-${Date.now()}@onboarding-e2e.test`;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .send({
        organizationName: `Org Onboarding E2E Test ${namePrefix} ${Date.now()}`,
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
    const email = `staff-${Date.now()}-${Math.random().toString(36).slice(2)}@onboarding-e2e.test`;
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
    const email = `${namePrefix}-${Date.now()}@onboarding-e2e.test`;
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

  function futureIso(daysFromNow: number) {
    return new Date(
      Date.now() + daysFromNow * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  // Bootstraps org + job + a HIRED, offer-ACCEPTED application, the
  // common precondition every onboarding test needs (REQ-DOC-001).
  async function setUpAcceptedOffer(namePrefix: string) {
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
    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ title: 'Software Engineer', expiresAt: futureIso(14) });
    await request(app.getHttpServer())
      .post(`/api/v1/applications/${applicationId}/offer/respond`)
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({ decision: 'ACCEPT' });
    return { orgId, jobId, applicationId, candidateToken, hrToken };
  }

  describe('POST /jobs/:jobId/applications/:id/onboarding', () => {
    it('creates a checklist for an offer-ACCEPTED application (happy path)', async () => {
      const { jobId, applicationId, hrToken } =
        await setUpAcceptedOffer('CreateHappy');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ tasks: [{ name: 'Submit ID proof' }] })
        .expect(201);

      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0]).toMatchObject({
        name: 'Submit ID proof',
        required: true,
        completedAt: null,
      });
    });

    it('returns 409 when the offer has not been accepted yet', async () => {
      const orgId = await registerAndApproveOrg('CreateNotAccepted');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken =
        await registerCandidateAndLogin('CreateNotAccepted');
      await uploadCv(candidateToken);
      const applicationId = await applyToJob(candidateToken, jobId);
      const hmToken = await addStaffAndLogin(orgId, 'HIRING_MANAGER');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/decide`)
        .set('Authorization', `Bearer ${hmToken}`)
        .send({ decision: 'HIRE' });
      const hrToken = await addStaffAndLogin(orgId, 'HR_MANAGER');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/offer`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ title: 'Software Engineer', expiresAt: futureIso(14) });

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ tasks: [{ name: 'Submit ID proof' }] })
        .expect(409);
    });

    it('returns 409 for a second checklist on the same application', async () => {
      const { jobId, applicationId, hrToken } =
        await setUpAcceptedOffer('CreateTwice');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ tasks: [{ name: 'Submit ID proof' }] });

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ tasks: [{ name: 'Submit tax form' }] })
        .expect(409);
    });

    it('rejects a role without onboarding:manage (e.g. Recruiter) with 403', async () => {
      const { orgId, jobId, applicationId } =
        await setUpAcceptedOffer('CreateForbidden');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ tasks: [{ name: 'Submit ID proof' }] })
        .expect(403);
    });

    it('rejects an unauthenticated request with 401', async () => {
      const { jobId, applicationId } = await setUpAcceptedOffer('CreateUnauth');

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding`)
        .send({ tasks: [{ name: 'Submit ID proof' }] })
        .expect(401);
    });
  });

  describe('POST .../onboarding/tasks and PATCH .../tasks/:taskId/complete', () => {
    it('adds a task and then marks it complete', async () => {
      const { jobId, applicationId, hrToken } =
        await setUpAcceptedOffer('TaskLifecycle');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ tasks: [{ name: 'Submit ID proof' }] });

      const addRes = await request(app.getHttpServer())
        .post(
          `/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding/tasks`,
        )
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Submit tax form', required: false })
        .expect(201);
      const addedTasks = addRes.body.tasks as Array<{
        id: string;
        name: string;
        required: boolean;
        completedAt: string | null;
      }>;
      expect(addedTasks).toHaveLength(2);
      const newTask = addedTasks.find((t) => t.name === 'Submit tax form');
      expect(newTask?.required).toBe(false);

      const completeRes = await request(app.getHttpServer())
        .patch(
          `/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding/tasks/${newTask?.id}/complete`,
        )
        .set('Authorization', `Bearer ${hrToken}`)
        .expect(200);
      const completedTasks = completeRes.body.tasks as Array<{
        id: string;
        completedAt: string | null;
      }>;
      const completedTask = completedTasks.find((t) => t.id === newTask?.id);
      expect(completedTask?.completedAt).not.toBeNull();
    });

    it('returns 403 for document:request on a role without it (e.g. Recruiter)', async () => {
      const { orgId, jobId, applicationId, hrToken } =
        await setUpAcceptedOffer('TaskForbidden');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ tasks: [{ name: 'Submit ID proof' }] });
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');

      await request(app.getHttpServer())
        .post(
          `/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding/tasks`,
        )
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ name: 'Submit tax form' })
        .expect(403);
    });
  });

  describe('GET /applications/:id/onboarding and document upload', () => {
    it('candidate reads their checklist and uploads a document (happy path)', async () => {
      const { jobId, applicationId, hrToken, candidateToken } =
        await setUpAcceptedOffer('CandidateHappy');
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ tasks: [{ name: 'Submit ID proof' }] });
      const taskId = createRes.body.tasks[0].id as string;

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/applications/${applicationId}/onboarding`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .expect(200);
      expect(getRes.body.tasks[0].name).toBe('Submit ID proof');

      const uploadRes = await request(app.getHttpServer())
        .post(
          `/api/v1/applications/${applicationId}/onboarding/tasks/${taskId}/documents`,
        )
        .set('Authorization', `Bearer ${candidateToken}`)
        .attach('file', Buffer.from('%PDF-1.4\n%mock id'), 'id-proof.pdf')
        .expect(201);
      expect(uploadRes.body.fileName).toBe('id-proof.pdf');

      const hrView = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding`)
        .set('Authorization', `Bearer ${hrToken}`)
        .expect(200);
      expect(hrView.body.tasks[0].documents).toHaveLength(1);
    });

    it("returns 404 for another candidate's application", async () => {
      const { jobId, applicationId, hrToken } =
        await setUpAcceptedOffer('CandidateCross');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ tasks: [{ name: 'Submit ID proof' }] });
      const otherCandidateToken = await registerCandidateAndLogin(
        'CandidateCrossOther',
      );

      await request(app.getHttpServer())
        .get(`/api/v1/applications/${applicationId}/onboarding`)
        .set('Authorization', `Bearer ${otherCandidateToken}`)
        .expect(404);
    });

    it('rejects an unauthenticated upload with 401', async () => {
      const { jobId, applicationId, hrToken } =
        await setUpAcceptedOffer('CandidateUnauth');
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/onboarding`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ tasks: [{ name: 'Submit ID proof' }] });
      const taskId = createRes.body.tasks[0].id as string;

      await request(app.getHttpServer())
        .post(
          `/api/v1/applications/${applicationId}/onboarding/tasks/${taskId}/documents`,
        )
        .attach('file', Buffer.from('%PDF-1.4\n%mock id'), 'id-proof.pdf')
        .expect(401);
    });
  });
});
