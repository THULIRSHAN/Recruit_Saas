import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('JobsController (e2e)', () => {
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
    // No job:* permissions -- used for "correct org, wrong permission" 403
    // tests (docs/testing.md §2 case 4).
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
    await grantPermission(recruiterRole.id, 'job:update');
    await grantPermission(recruiterRole.id, 'pipeline:manage');
  });

  afterAll(async () => {
    // Job.organization and PipelineTemplate.organization both have no
    // onDelete: Cascade, so these rows must be deleted before their
    // Organization or the FK constraint rejects the delete.
    // RecruitmentStage cascades from Job, so no separate cleanup needed.
    await prisma.job.deleteMany({
      where: { organizationId: { in: orgIdsToClean } },
    });
    await prisma.pipelineTemplate.deleteMany({
      where: { organizationId: { in: orgIdsToClean } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: '@jobs-e2e.test' } },
    });
    await prisma.organization.deleteMany({
      where: { name: { contains: 'Org Jobs E2E Test' } },
    });
    await app.close();
  });

  async function createSuperAdminAndLogin() {
    const email = `super-${Date.now()}-${Math.random().toString(36).slice(2)}@jobs-e2e.test`;
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
    const email = `${namePrefix}-owner-${Date.now()}@jobs-e2e.test`;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .send({
        organizationName: `Org Jobs E2E Test ${namePrefix} ${Date.now()}`,
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
    const email = `staff-${Date.now()}-${Math.random().toString(36).slice(2)}@jobs-e2e.test`;
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

  async function createJob(
    token: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Software Engineer',
        description: 'Build things.',
        ...overrides,
      });
    return res.body.id as string;
  }

  async function createTemplate(
    token: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/pipeline-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Standard Pipeline',
        stages: ['Applied', 'Interview'],
        ...overrides,
      });
    return res.body.id as string;
  }

  describe('POST /jobs', () => {
    it('creates a DRAFT job scoped to the caller org (happy path)', async () => {
      const orgId = await registerAndApproveOrg('CreateHappy');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');

      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Software Engineer',
          description: 'Build things.',
          department: 'Engineering',
          location: 'Remote',
          employmentType: 'FULL_TIME',
          salaryMin: 80_000,
          salaryMax: 120_000,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        organizationId: orgId,
        title: 'Software Engineer',
        status: 'DRAFT',
        salaryMin: 80_000,
        salaryMax: 120_000,
      });
    });

    it('rejects a missing title with 400', async () => {
      const orgId = await registerAndApproveOrg('CreateInvalid');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');

      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Build things.' })
        .expect(400);
    });

    it('rejects salaryMin greater than salaryMax with 400', async () => {
      const orgId = await registerAndApproveOrg('CreateBadSalary');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');

      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Software Engineer',
          description: 'Build things.',
          salaryMin: 120_000,
          salaryMax: 80_000,
        })
        .expect(400);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({ title: 'Software Engineer', description: 'Build things.' })
        .expect(401);
    });

    it('rejects a role without job:create (e.g. Interviewer) with 403', async () => {
      const orgId = await registerAndApproveOrg('CreateForbidden');
      const token = await addStaffAndLogin(orgId, 'INTERVIEWER');

      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Software Engineer', description: 'Build things.' })
        .expect(403);
    });
  });

  describe('GET /jobs', () => {
    it('lists only the caller org’s own jobs (happy path + tenant isolation)', async () => {
      const orgId = await registerAndApproveOrg('ListMine');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createJob(token);

      const otherOrgId = await registerAndApproveOrg('ListOther');
      const otherToken = await addStaffAndLogin(otherOrgId, 'RECRUITER');
      await createJob(otherToken, { title: 'Should not appear' });

      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const ids = (res.body.data as Array<{ id: string }>).map((j) => j.id);
      expect(ids).toContain(jobId);
      expect(
        (res.body.data as Array<{ title: string }>).some(
          (j) => j.title === 'Should not appear',
        ),
      ).toBe(false);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/jobs').expect(401);
    });

    it('rejects a role without job:read (e.g. Interviewer) with 403', async () => {
      const orgId = await registerAndApproveOrg('ListForbidden');
      const token = await addStaffAndLogin(orgId, 'INTERVIEWER');

      await request(app.getHttpServer())
        .get('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('GET /jobs/:id', () => {
    it('returns a job scoped to the caller org (happy path)', async () => {
      const orgId = await registerAndApproveOrg('GetOneHappy');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createJob(token);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({ id: jobId, organizationId: orgId });
    });

    it('rejects an unauthenticated request with 401', async () => {
      const orgId = await registerAndApproveOrg('GetOne401');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createJob(token);

      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}`)
        .expect(401);
    });

    it('rejects a role without job:read with 403', async () => {
      const orgId = await registerAndApproveOrg('GetOneForbidden');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createJob(recruiterToken);
      const interviewerToken = await addStaffAndLogin(orgId, 'INTERVIEWER');

      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .expect(403);
    });

    it('returns 404 for a cross-tenant job (correct role, wrong org) and leaks no data', async () => {
      const orgAId = await registerAndApproveOrg('CrossTenantA');
      const tokenA = await addStaffAndLogin(orgAId, 'RECRUITER');
      const jobId = await createJob(tokenA, { title: 'Org A Secret Job' });

      const orgBId = await registerAndApproveOrg('CrossTenantB');
      const tokenB = await addStaffAndLogin(orgBId, 'RECRUITER');

      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      expect(JSON.stringify(res.body)).not.toContain('Org A Secret Job');
    });

    it('returns 404 for a nonexistent job id', async () => {
      const orgId = await registerAndApproveOrg('GetOneNotFound');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');

      await request(app.getHttpServer())
        .get('/api/v1/jobs/does-not-exist')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PATCH /jobs/:id', () => {
    it('updates a job in any status (happy path)', async () => {
      const orgId = await registerAndApproveOrg('PatchHappy');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createJob(token);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Senior Software Engineer' })
        .expect(200);

      expect(res.body).toMatchObject({ title: 'Senior Software Engineer' });
    });

    it('rejects an empty title with 400', async () => {
      const orgId = await registerAndApproveOrg('PatchInvalid');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createJob(token);

      await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '' })
        .expect(400);
    });

    it('rejects an unauthenticated request with 401', async () => {
      const orgId = await registerAndApproveOrg('Patch401');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createJob(token);

      await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}`)
        .send({ title: 'Senior Software Engineer' })
        .expect(401);
    });

    it('rejects a role without job:update with 403', async () => {
      const orgId = await registerAndApproveOrg('PatchForbidden');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createJob(recruiterToken);
      const interviewerToken = await addStaffAndLogin(orgId, 'INTERVIEWER');

      await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({ title: 'Senior Software Engineer' })
        .expect(403);
    });

    it('returns 404 for a cross-tenant job (correct role, wrong org), without modifying it', async () => {
      const orgAId = await registerAndApproveOrg('PatchCrossTenantA');
      const tokenA = await addStaffAndLogin(orgAId, 'RECRUITER');
      const jobId = await createJob(tokenA, { title: 'Org A Original Title' });

      const orgBId = await registerAndApproveOrg('PatchCrossTenantB');
      const tokenB = await addStaffAndLogin(orgBId, 'RECRUITER');

      await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ title: 'Hijacked Title' })
        .expect(404);

      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
      expect(job.title).toBe('Org A Original Title');
    });

    it('returns 404 for a nonexistent job id', async () => {
      const orgId = await registerAndApproveOrg('PatchNotFound');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');

      await request(app.getHttpServer())
        .patch('/api/v1/jobs/does-not-exist')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Senior Software Engineer' })
        .expect(404);
    });
  });

  describe('GET /jobs/:id/stages', () => {
    it('returns the ordered stages for a job (happy path)', async () => {
      const orgId = await registerAndApproveOrg('StagesGetHappy');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createJob(token);
      await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}/stages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ stages: ['Applied', 'Interview'] });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/stages`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject([
        { name: 'Applied', order: 0 },
        { name: 'Interview', order: 1 },
      ]);
    });

    it('returns an empty list for a job with no stages yet', async () => {
      const orgId = await registerAndApproveOrg('StagesGetEmpty');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createJob(token);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/stages`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('returns 404 for a cross-tenant job', async () => {
      const orgAId = await registerAndApproveOrg('StagesGetCrossA');
      const tokenA = await addStaffAndLogin(orgAId, 'RECRUITER');
      const jobId = await createJob(tokenA);

      const orgBId = await registerAndApproveOrg('StagesGetCrossB');
      const tokenB = await addStaffAndLogin(orgBId, 'RECRUITER');

      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/stages`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });

  describe('PATCH /jobs/:id/stages', () => {
    it('replaces the stage list wholesale (happy path)', async () => {
      const orgId = await registerAndApproveOrg('StagesPatchHappy');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createJob(token);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}/stages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ stages: ['Screening', 'Offer'] })
        .expect(200);

      expect(res.body).toMatchObject([
        { name: 'Screening', order: 0 },
        { name: 'Offer', order: 1 },
      ]);
    });

    it('rejects an empty stages array with 400', async () => {
      const orgId = await registerAndApproveOrg('StagesPatchInvalid');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createJob(token);

      await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}/stages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ stages: [] })
        .expect(400);
    });

    it('rejects a role without pipeline:manage (e.g. Interviewer) with 403', async () => {
      const orgId = await registerAndApproveOrg('StagesPatchForbidden');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createJob(recruiterToken);
      const interviewerToken = await addStaffAndLogin(orgId, 'INTERVIEWER');

      await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}/stages`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({ stages: ['Screening'] })
        .expect(403);
    });

    it('returns 404 for a cross-tenant job, without modifying its stages', async () => {
      const orgAId = await registerAndApproveOrg('StagesPatchCrossA');
      const tokenA = await addStaffAndLogin(orgAId, 'RECRUITER');
      const jobId = await createJob(tokenA);
      await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}/stages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ stages: ['Applied'] });

      const orgBId = await registerAndApproveOrg('StagesPatchCrossB');
      const tokenB = await addStaffAndLogin(orgBId, 'RECRUITER');

      await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}/stages`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ stages: ['Hijacked'] })
        .expect(404);

      const stages = await prisma.recruitmentStage.findMany({
        where: { jobId },
      });
      expect(stages.map((s) => s.name)).toEqual(['Applied']);
    });
  });

  describe('POST /jobs/:id/stages/apply-template', () => {
    it("copies the template's stages into the job (happy path)", async () => {
      const orgId = await registerAndApproveOrg('ApplyTemplateHappy');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createJob(token);
      const templateId = await createTemplate(token, {
        stages: ['Applied', 'Screening', 'Offer'],
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/stages/apply-template`)
        .set('Authorization', `Bearer ${token}`)
        .send({ pipelineTemplateId: templateId })
        .expect(201);

      expect(res.body).toMatchObject([
        { name: 'Applied', order: 0 },
        { name: 'Screening', order: 1 },
        { name: 'Offer', order: 2 },
      ]);
    });

    it('returns 404 when the template belongs to a different org', async () => {
      const orgAId = await registerAndApproveOrg('ApplyTemplateCrossA');
      const tokenA = await addStaffAndLogin(orgAId, 'RECRUITER');
      const templateId = await createTemplate(tokenA);

      const orgBId = await registerAndApproveOrg('ApplyTemplateCrossB');
      const tokenB = await addStaffAndLogin(orgBId, 'RECRUITER');
      const jobId = await createJob(tokenB);

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/stages/apply-template`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ pipelineTemplateId: templateId })
        .expect(404);

      const stages = await prisma.recruitmentStage.findMany({
        where: { jobId },
      });
      expect(stages).toHaveLength(0);
    });

    it('returns 404 for a cross-tenant job', async () => {
      const orgAId = await registerAndApproveOrg('ApplyTemplateJobCrossA');
      const tokenA = await addStaffAndLogin(orgAId, 'RECRUITER');
      const jobId = await createJob(tokenA);

      const orgBId = await registerAndApproveOrg('ApplyTemplateJobCrossB');
      const tokenB = await addStaffAndLogin(orgBId, 'RECRUITER');
      const templateId = await createTemplate(tokenB);

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/stages/apply-template`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ pipelineTemplateId: templateId })
        .expect(404);
    });
  });
});
