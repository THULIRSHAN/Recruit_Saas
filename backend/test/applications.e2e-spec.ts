import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('ApplicationsController (e2e)', () => {
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
    await prisma.role.upsert({
      where: { key: 'COMPANY_OWNER' },
      update: {},
      create: { key: 'COMPANY_OWNER', name: 'Company Owner' },
    });
    const recruiterRole = await prisma.role.upsert({
      where: { key: 'RECRUITER' },
      update: {},
      create: { key: 'RECRUITER', name: 'Recruiter' },
    });
    const candidateRole = await prisma.role.upsert({
      where: { key: 'CANDIDATE' },
      update: {},
      create: { key: 'CANDIDATE', name: 'Candidate' },
    });
    const hiringManagerRole = await prisma.role.upsert({
      where: { key: 'HIRING_MANAGER' },
      update: {},
      create: { key: 'HIRING_MANAGER', name: 'Hiring Manager' },
    });
    // No application:* permissions -- used for "correct org, wrong
    // permission" 403 tests (docs/testing.md §2 case 4), same role jobs.e2e-
    // spec.ts uses for the equivalent job:* case.
    await prisma.role.upsert({
      where: { key: 'INTERVIEWER' },
      update: {},
      create: { key: 'INTERVIEWER', name: 'Interviewer' },
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
    await grantPermission(recruiterRole.id, 'job:read');
    await grantPermission(recruiterRole.id, 'job:publish');
    await grantPermission(recruiterRole.id, 'pipeline:manage');
    await grantPermission(recruiterRole.id, 'application:read');
    await grantPermission(recruiterRole.id, 'application:screen');
    await grantPermission(candidateRole.id, 'application:create');
    await grantPermission(candidateRole.id, 'application:read');
    await grantPermission(candidateRole.id, 'application:withdraw');
    await grantPermission(candidateRole.id, 'candidateProfile:update');
    // Deliberately no application:screen -- REQ-APP-002's stated actor is
    // Recruiter only.
    await grantPermission(hiringManagerRole.id, 'application:read');
    // Q6: Hiring Manager is the sole finalizer for REQ-HIRE-001.
    await grantPermission(hiringManagerRole.id, 'application:decide');
  });

  afterAll(async () => {
    // Application has no onDelete: Cascade from Job (its own FK, not
    // shown here, but Job.organization has none either, established
    // pattern) -- delete children before their parents so the FK
    // constraints don't reject the Organization delete.
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
      where: { email: { contains: '@applications-e2e.test' } },
    });
    await prisma.organization.deleteMany({
      where: { name: { contains: 'Org Applications E2E Test' } },
    });
    await app.close();
  });

  async function createSuperAdminAndLogin() {
    const email = `super-${Date.now()}-${Math.random().toString(36).slice(2)}@applications-e2e.test`;
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
    const email = `${namePrefix}-owner-${Date.now()}@applications-e2e.test`;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .send({
        organizationName: `Org Applications E2E Test ${namePrefix} ${Date.now()}`,
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

  async function addRecruiterAndLogin(orgId: string) {
    return addStaffAndLogin(orgId, 'RECRUITER');
  }

  async function addStaffAndLogin(orgId: string, roleKey: string) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: roleKey },
    });
    const email = `staff-${Date.now()}-${Math.random().toString(36).slice(2)}@applications-e2e.test`;
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

  async function createPublishedJob(
    recruiterToken: string,
    overrides: Record<string, unknown> = {},
  ) {
    const jobRes = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        title: 'Software Engineer',
        description: 'Build things.',
        ...overrides,
      });
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
    const email = `${namePrefix}-${Date.now()}@applications-e2e.test`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', fullName: 'Test Candidate' });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    return loginRes.body.accessToken as string;
  }

  async function uploadCv(candidateToken: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/candidates/me/cvs')
      .set('Authorization', `Bearer ${candidateToken}`)
      .attach('file', Buffer.from('%PDF-1.4\n%mock cv'), 'resume.pdf');
    return res.body.id as string;
  }

  async function applyToJob(candidateToken: string, jobId: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({ jobId });
    return res.body.id as string;
  }

  describe('POST /applications', () => {
    it('creates an ACTIVE application in the job’s first stage, using the primary CV (happy path)', async () => {
      const orgId = await registerAndApproveOrg('CreateHappy');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('CreateHappy');
      await uploadCv(candidateToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ jobId, coverNote: 'I would love to join.' })
        .expect(201);

      expect(res.body).toMatchObject({
        status: 'ACTIVE',
        coverNote: 'I would love to join.',
        job: { id: jobId, organization: { id: orgId } },
        stage: { name: 'Applied' },
      });
    });

    it('uses an explicitly provided cvId instead of the primary CV', async () => {
      const orgId = await registerAndApproveOrg('CreateExplicitCv');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken =
        await registerCandidateAndLogin('CreateExplicitCv');
      await uploadCv(candidateToken);
      const secondCvId = await uploadCv(candidateToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ jobId, cvId: secondCvId })
        .expect(201);

      expect(res.body.cv.id).toBe(secondCvId);
    });

    it('returns 422 when the candidate has no CV and provides none', async () => {
      const orgId = await registerAndApproveOrg('CreateNoCv');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('CreateNoCv');

      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ jobId })
        .expect(422);
    });

    it('returns 422 when cvId does not belong to the caller', async () => {
      const orgId = await registerAndApproveOrg('CreateForeignCv');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateTokenA =
        await registerCandidateAndLogin('CreateForeignCvA');
      const foreignCvId = await uploadCv(candidateTokenA);
      const candidateTokenB =
        await registerCandidateAndLogin('CreateForeignCvB');

      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateTokenB}`)
        .send({ jobId, cvId: foreignCvId })
        .expect(422);
    });

    it('returns 404 for a DRAFT job (not yet published)', async () => {
      const orgId = await registerAndApproveOrg('CreateDraftJob');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobRes = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ title: 'Draft Job', description: 'Not published yet.' });
      const candidateToken = await registerCandidateAndLogin('CreateDraftJob');
      await uploadCv(candidateToken);

      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ jobId: jobRes.body.id })
        .expect(404);
    });

    it('returns 404 for a nonexistent job id', async () => {
      const candidateToken = await registerCandidateAndLogin('CreateBadJobId');
      await uploadCv(candidateToken);

      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ jobId: 'does-not-exist' })
        .expect(404);
    });

    it('returns 409 for a second active application to the same job', async () => {
      const orgId = await registerAndApproveOrg('CreateDuplicate');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('CreateDuplicate');
      await uploadCv(candidateToken);

      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ jobId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ jobId })
        .expect(409);
    });

    it('allows re-applying after withdrawing the previous application', async () => {
      const orgId = await registerAndApproveOrg('CreateReapply');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('CreateReapply');
      await uploadCv(candidateToken);

      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ jobId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${firstRes.body.id}/withdraw`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ jobId })
        .expect(201);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send({ jobId: 'irrelevant' })
        .expect(401);
    });
  });

  describe('GET /applications/me', () => {
    it('lists only the caller’s own applications', async () => {
      const orgId = await registerAndApproveOrg('ListMine');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateTokenA = await registerCandidateAndLogin('ListMineA');
      await uploadCv(candidateTokenA);
      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateTokenA}`)
        .send({ jobId });
      const candidateTokenB = await registerCandidateAndLogin('ListMineB');

      const resA = await request(app.getHttpServer())
        .get('/api/v1/applications/me')
        .set('Authorization', `Bearer ${candidateTokenA}`)
        .expect(200);
      expect(resA.body.data).toHaveLength(1);

      const resB = await request(app.getHttpServer())
        .get('/api/v1/applications/me')
        .set('Authorization', `Bearer ${candidateTokenB}`)
        .expect(200);
      expect(resB.body.data).toHaveLength(0);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/applications/me')
        .expect(401);
    });
  });

  describe('GET /applications/:id', () => {
    it('returns 404 for another candidate’s application', async () => {
      const orgId = await registerAndApproveOrg('GetOneCross');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateTokenA = await registerCandidateAndLogin('GetOneCrossA');
      await uploadCv(candidateTokenA);
      const appRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateTokenA}`)
        .send({ jobId });
      const candidateTokenB = await registerCandidateAndLogin('GetOneCrossB');

      await request(app.getHttpServer())
        .get(`/api/v1/applications/${appRes.body.id}`)
        .set('Authorization', `Bearer ${candidateTokenB}`)
        .expect(404);
    });
  });

  describe('POST /applications/:id/withdraw', () => {
    it('withdraws an ACTIVE application (happy path)', async () => {
      const orgId = await registerAndApproveOrg('WithdrawHappy');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('WithdrawHappy');
      await uploadCv(candidateToken);
      const appRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ jobId });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/applications/${appRes.body.id}/withdraw`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .expect(201);
      expect(res.body.status).toBe('WITHDRAWN');
    });

    it('returns 409 when withdrawing an already-withdrawn application', async () => {
      const orgId = await registerAndApproveOrg('WithdrawTwice');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('WithdrawTwice');
      await uploadCv(candidateToken);
      const appRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ jobId });
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${appRes.body.id}/withdraw`)
        .set('Authorization', `Bearer ${candidateToken}`);

      await request(app.getHttpServer())
        .post(`/api/v1/applications/${appRes.body.id}/withdraw`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .expect(409);
    });

    it('returns 404 for another candidate’s application, without withdrawing it', async () => {
      const orgId = await registerAndApproveOrg('WithdrawCross');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateTokenA = await registerCandidateAndLogin('WithdrawCrossA');
      await uploadCv(candidateTokenA);
      const appRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${candidateTokenA}`)
        .send({ jobId });
      const candidateTokenB = await registerCandidateAndLogin('WithdrawCrossB');

      await request(app.getHttpServer())
        .post(`/api/v1/applications/${appRes.body.id}/withdraw`)
        .set('Authorization', `Bearer ${candidateTokenB}`)
        .expect(404);

      const check = await prisma.application.findUniqueOrThrow({
        where: { id: appRes.body.id as string },
      });
      expect(check.status).toBe('ACTIVE');
    });
  });

  describe('GET /jobs/:jobId/applications', () => {
    it('lists applications scoped to the job (happy path)', async () => {
      const orgId = await registerAndApproveOrg('JobListHappy');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('JobListHappy');
      await uploadCv(candidateToken);
      await applyToJob(candidateToken, jobId);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/applications`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        status: 'ACTIVE',
        candidate: {
          email: expect.stringContaining('@applications-e2e.test') as string,
        },
      });
    });

    it('is readable by a Hiring Manager (application:read, not just Recruiter)', async () => {
      const orgId = await registerAndApproveOrg('JobListHm');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const hmToken = await addStaffAndLogin(orgId, 'HIRING_MANAGER');

      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/applications`)
        .set('Authorization', `Bearer ${hmToken}`)
        .expect(200);
    });

    it('returns 404 for a job belonging to another organization', async () => {
      const orgIdA = await registerAndApproveOrg('JobListCrossA');
      const recruiterTokenA = await addRecruiterAndLogin(orgIdA);
      const jobId = await createPublishedJob(recruiterTokenA);
      const orgIdB = await registerAndApproveOrg('JobListCrossB');
      const recruiterTokenB = await addRecruiterAndLogin(orgIdB);

      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/applications`)
        .set('Authorization', `Bearer ${recruiterTokenB}`)
        .expect(404);
    });

    it('rejects a role without application:read (e.g. Interviewer) with 403', async () => {
      const orgId = await registerAndApproveOrg('JobListForbidden');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const interviewerToken = await addStaffAndLogin(orgId, 'INTERVIEWER');

      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/applications`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .expect(403);
    });

    it('rejects an unauthenticated request with 401', async () => {
      const orgId = await registerAndApproveOrg('JobListUnauth');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);

      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/applications`)
        .expect(401);
    });
  });

  describe('GET /jobs/:jobId/applications/:id', () => {
    it('returns 404 for an application belonging to a different job', async () => {
      const orgId = await registerAndApproveOrg('JobGetWrongJob');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const otherJobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('JobGetWrongJob');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobId);

      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${otherJobId}/applications/${appId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(404);
    });
  });

  describe('POST /jobs/:jobId/applications/:id/screen', () => {
    it("PASS advances the application to the job's next pipeline stage", async () => {
      const orgId = await registerAndApproveOrg('ScreenPass');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken); // stages: Applied, Interview
      const candidateToken = await registerCandidateAndLogin('ScreenPass');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobId);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${appId}/screen`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ decision: 'PASS' })
        .expect(201);

      expect(res.body.stage.name).toBe('Interview');
      expect(res.body.status).toBe('ACTIVE');
    });

    it("returns 422 when PASSing from the job's last stage", async () => {
      const orgId = await registerAndApproveOrg('ScreenPassLast');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('ScreenPassLast');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobId);
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${appId}/screen`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ decision: 'PASS' });

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${appId}/screen`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ decision: 'PASS' })
        .expect(422);
    });

    it('REJECT sets a terminal status with the given reason', async () => {
      const orgId = await registerAndApproveOrg('ScreenReject');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('ScreenReject');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobId);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${appId}/screen`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ decision: 'REJECT', reason: 'Not enough experience.' })
        .expect(201);

      expect(res.body).toMatchObject({
        status: 'REJECTED',
        rejectedReason: 'Not enough experience.',
      });
    });

    it('returns 409 when screening an already-rejected application', async () => {
      const orgId = await registerAndApproveOrg('ScreenTwice');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('ScreenTwice');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobId);
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${appId}/screen`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ decision: 'REJECT' });

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${appId}/screen`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ decision: 'REJECT' })
        .expect(409);
    });

    it('returns 404 for a cross-tenant application id', async () => {
      const orgIdA = await registerAndApproveOrg('ScreenCrossA');
      const recruiterTokenA = await addRecruiterAndLogin(orgIdA);
      const jobIdA = await createPublishedJob(recruiterTokenA);
      const candidateToken = await registerCandidateAndLogin('ScreenCrossA');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobIdA);

      const orgIdB = await registerAndApproveOrg('ScreenCrossB');
      const recruiterTokenB = await addRecruiterAndLogin(orgIdB);
      const jobIdB = await createPublishedJob(recruiterTokenB);

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobIdB}/applications/${appId}/screen`)
        .set('Authorization', `Bearer ${recruiterTokenB}`)
        .send({ decision: 'REJECT' })
        .expect(404);
    });

    it('rejects a Hiring Manager (application:read only, not application:screen) with 403', async () => {
      const orgId = await registerAndApproveOrg('ScreenHmForbidden');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken =
        await registerCandidateAndLogin('ScreenHmForbidden');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobId);
      const hmToken = await addStaffAndLogin(orgId, 'HIRING_MANAGER');

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${appId}/screen`)
        .set('Authorization', `Bearer ${hmToken}`)
        .send({ decision: 'REJECT' })
        .expect(403);
    });

    it('rejects an unauthenticated request with 401', async () => {
      const orgId = await registerAndApproveOrg('ScreenUnauth');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('ScreenUnauth');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobId);

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${appId}/screen`)
        .send({ decision: 'REJECT' })
        .expect(401);
    });
  });

  describe('POST /jobs/:jobId/applications/:id/decide', () => {
    it('HIRE sets a HIRED status (happy path)', async () => {
      const orgId = await registerAndApproveOrg('DecideHire');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('DecideHire');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobId);
      const hmToken = await addStaffAndLogin(orgId, 'HIRING_MANAGER');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${appId}/decide`)
        .set('Authorization', `Bearer ${hmToken}`)
        .send({ decision: 'HIRE' })
        .expect(201);

      expect(res.body.status).toBe('HIRED');
    });

    it('REJECT sets a REJECTED status with the given reason', async () => {
      const orgId = await registerAndApproveOrg('DecideReject');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('DecideReject');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobId);
      const hmToken = await addStaffAndLogin(orgId, 'HIRING_MANAGER');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${appId}/decide`)
        .set('Authorization', `Bearer ${hmToken}`)
        .send({ decision: 'REJECT', reason: 'Panel unanimous no.' })
        .expect(201);

      expect(res.body).toMatchObject({
        status: 'REJECTED',
        rejectedReason: 'Panel unanimous no.',
      });
    });

    it('returns 409 when the application is already decided', async () => {
      const orgId = await registerAndApproveOrg('DecideTwice');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('DecideTwice');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobId);
      const hmToken = await addStaffAndLogin(orgId, 'HIRING_MANAGER');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${appId}/decide`)
        .set('Authorization', `Bearer ${hmToken}`)
        .send({ decision: 'HIRE' });

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${appId}/decide`)
        .set('Authorization', `Bearer ${hmToken}`)
        .send({ decision: 'REJECT' })
        .expect(409);
    });

    it('rejects a Recruiter (application:screen only, not application:decide) with 403', async () => {
      const orgId = await registerAndApproveOrg('DecideForbidden');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('DecideForbidden');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobId);

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${appId}/decide`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ decision: 'HIRE' })
        .expect(403);
    });

    it('returns 404 for a cross-tenant application id', async () => {
      const orgIdA = await registerAndApproveOrg('DecideCrossA');
      const recruiterTokenA = await addRecruiterAndLogin(orgIdA);
      const jobIdA = await createPublishedJob(recruiterTokenA);
      const candidateToken = await registerCandidateAndLogin('DecideCrossA');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobIdA);

      const orgIdB = await registerAndApproveOrg('DecideCrossB');
      const recruiterTokenB = await addRecruiterAndLogin(orgIdB);
      const jobIdB = await createPublishedJob(recruiterTokenB);
      const hmTokenB = await addStaffAndLogin(orgIdB, 'HIRING_MANAGER');

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobIdB}/applications/${appId}/decide`)
        .set('Authorization', `Bearer ${hmTokenB}`)
        .send({ decision: 'HIRE' })
        .expect(404);
    });

    it('rejects an unauthenticated request with 401', async () => {
      const orgId = await registerAndApproveOrg('DecideUnauth');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('DecideUnauth');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobId);

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${appId}/decide`)
        .send({ decision: 'HIRE' })
        .expect(401);
    });
  });

  describe('GET /organizations/me/applications', () => {
    it('lists applications across every job in the org, newest first (happy path)', async () => {
      const orgId = await registerAndApproveOrg('OrgListHappy');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('OrgListHappy');
      await uploadCv(candidateToken);
      const appId = await applyToJob(candidateToken, jobId);

      const res = await request(app.getHttpServer())
        .get('/api/v1/organizations/me/applications')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      expect(
        (res.body.data as Array<{ id: string; job: { id: string } }>).find(
          (a) => a.id === appId,
        ),
      ).toMatchObject({ job: { id: jobId } });
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 20 });
    });

    it('is readable by a Hiring Manager (application:read, not just Recruiter)', async () => {
      const orgId = await registerAndApproveOrg('OrgListHm');
      const recruiterToken = await addRecruiterAndLogin(orgId);
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('OrgListHm');
      await uploadCv(candidateToken);
      await applyToJob(candidateToken, jobId);
      const hmToken = await addStaffAndLogin(orgId, 'HIRING_MANAGER');

      const res = await request(app.getHttpServer())
        .get('/api/v1/organizations/me/applications')
        .set('Authorization', `Bearer ${hmToken}`)
        .expect(200);

      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it("does not leak another organization's applications", async () => {
      const orgIdA = await registerAndApproveOrg('OrgListA');
      const recruiterTokenA = await addRecruiterAndLogin(orgIdA);
      const jobIdA = await createPublishedJob(recruiterTokenA);
      const candidateTokenA = await registerCandidateAndLogin('OrgListA');
      await uploadCv(candidateTokenA);
      await applyToJob(candidateTokenA, jobIdA);

      const orgIdB = await registerAndApproveOrg('OrgListB');
      const recruiterTokenB = await addRecruiterAndLogin(orgIdB);

      const res = await request(app.getHttpServer())
        .get('/api/v1/organizations/me/applications')
        .set('Authorization', `Bearer ${recruiterTokenB}`)
        .expect(200);

      expect(res.body.meta.total).toBe(0);
    });

    it('rejects a role without application:read (e.g. Interviewer) with 403', async () => {
      const orgId = await registerAndApproveOrg('OrgListForbidden');
      const interviewerToken = await addStaffAndLogin(orgId, 'INTERVIEWER');

      await request(app.getHttpServer())
        .get('/api/v1/organizations/me/applications')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .expect(403);
    });

    it("rejects a candidate's own token with 403 (implicit CANDIDATE grant must not satisfy this org-scoped route)", async () => {
      const candidateToken =
        await registerCandidateAndLogin('OrgListCandidate');

      await request(app.getHttpServer())
        .get('/api/v1/organizations/me/applications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .expect(403);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/organizations/me/applications')
        .expect(401);
    });
  });
});
