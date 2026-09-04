import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('TalentPools (e2e)', () => {
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
    // No talentPool:manage -- used for the "correct org, wrong permission"
    // 403 test.
    await prisma.role.upsert({
      where: { key: 'HIRING_MANAGER' },
      update: {},
      create: { key: 'HIRING_MANAGER', name: 'Hiring Manager' },
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
    await grantPermission(recruiterRole.id, 'talentPool:manage');
    await grantPermission(candidateRole.id, 'application:create');
    await grantPermission(candidateRole.id, 'candidateProfile:update');
  });

  afterAll(async () => {
    // TalentPoolCandidate cascades from TalentPool (onDelete: Cascade),
    // but TalentPool itself has no cascade from Organization.
    await prisma.talentPool.deleteMany({
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
      where: { email: { contains: '@talent-pools-e2e.test' } },
    });
    await prisma.organization.deleteMany({
      where: { name: { contains: 'Org TalentPools E2E Test' } },
    });
    await app.close();
  });

  async function createSuperAdminAndLogin() {
    const email = `super-${Date.now()}-${Math.random().toString(36).slice(2)}@talent-pools-e2e.test`;
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
    const email = `${namePrefix}-owner-${Date.now()}@talent-pools-e2e.test`;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .send({
        organizationName: `Org TalentPools E2E Test ${namePrefix} ${Date.now()}`,
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
    const email = `staff-${Date.now()}-${Math.random().toString(36).slice(2)}@talent-pools-e2e.test`;
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
      .send({ stages: ['Applied'] });
    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/publish`)
      .set('Authorization', `Bearer ${recruiterToken}`);
    return jobId;
  }

  async function registerCandidateAndLogin(namePrefix: string) {
    const email = `${namePrefix}-${Date.now()}@talent-pools-e2e.test`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', fullName: 'Test Candidate' });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    return {
      token: loginRes.body.accessToken as string,
      userId: registerRes.body.id as string,
    };
  }

  async function uploadCv(candidateToken: string) {
    await request(app.getHttpServer())
      .post('/api/v1/candidates/me/cvs')
      .set('Authorization', `Bearer ${candidateToken}`)
      .attach('file', Buffer.from('%PDF-1.4\n%mock cv'), 'resume.pdf');
  }

  async function applyToJob(candidateToken: string, jobId: string) {
    await request(app.getHttpServer())
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({ jobId });
  }

  async function createPool(recruiterToken: string, name: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/talent-pools')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ name });
    return res.body.id as string;
  }

  describe('POST /talent-pools', () => {
    it('creates a pool (happy path)', async () => {
      const orgId = await registerAndApproveOrg('CreateHappy');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');

      const res = await request(app.getHttpServer())
        .post('/api/v1/talent-pools')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ name: 'Strong Bench' })
        .expect(201);

      expect(res.body).toMatchObject({ name: 'Strong Bench', candidates: [] });
    });

    it('rejects a role without talentPool:manage (e.g. Hiring Manager) with 403', async () => {
      const orgId = await registerAndApproveOrg('CreateForbidden');
      const hmToken = await addStaffAndLogin(orgId, 'HIRING_MANAGER');

      await request(app.getHttpServer())
        .post('/api/v1/talent-pools')
        .set('Authorization', `Bearer ${hmToken}`)
        .send({ name: 'Strong Bench' })
        .expect(403);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/talent-pools')
        .send({ name: 'Strong Bench' })
        .expect(401);
    });
  });

  describe('GET /talent-pools/:id', () => {
    it('returns 404 for a pool belonging to another organization', async () => {
      const orgIdA = await registerAndApproveOrg('GetCrossA');
      const recruiterTokenA = await addStaffAndLogin(orgIdA, 'RECRUITER');
      const poolId = await createPool(recruiterTokenA, 'Strong Bench');

      const orgIdB = await registerAndApproveOrg('GetCrossB');
      const recruiterTokenB = await addStaffAndLogin(orgIdB, 'RECRUITER');

      await request(app.getHttpServer())
        .get(`/api/v1/talent-pools/${poolId}`)
        .set('Authorization', `Bearer ${recruiterTokenB}`)
        .expect(404);
    });
  });

  describe('POST /talent-pools/:id/candidates', () => {
    it('tags a candidate who has applied to this org (happy path)', async () => {
      const orgId = await registerAndApproveOrg('TagHappy');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createPublishedJob(recruiterToken);
      const { token: candidateToken, userId: candidateId } =
        await registerCandidateAndLogin('TagHappy');
      await uploadCv(candidateToken);
      await applyToJob(candidateToken, jobId);
      const poolId = await createPool(recruiterToken, 'Strong Bench');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/talent-pools/${poolId}/candidates`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ candidateId })
        .expect(201);

      expect(res.body.candidates).toHaveLength(1);
      expect(res.body.candidates[0]).toMatchObject({
        id: candidateId,
        fullName: 'Test Candidate',
      });
    });

    it('returns 422 for a candidate who has never applied to this org', async () => {
      const orgId = await registerAndApproveOrg('TagOutsider');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');
      const poolId = await createPool(recruiterToken, 'Strong Bench');
      const { userId: outsiderId } =
        await registerCandidateAndLogin('TagOutsider');

      await request(app.getHttpServer())
        .post(`/api/v1/talent-pools/${poolId}/candidates`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ candidateId: outsiderId })
        .expect(422);
    });

    it('returns 409 when tagging the same candidate twice', async () => {
      const orgId = await registerAndApproveOrg('TagTwice');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createPublishedJob(recruiterToken);
      const { token: candidateToken, userId: candidateId } =
        await registerCandidateAndLogin('TagTwice');
      await uploadCv(candidateToken);
      await applyToJob(candidateToken, jobId);
      const poolId = await createPool(recruiterToken, 'Strong Bench');
      await request(app.getHttpServer())
        .post(`/api/v1/talent-pools/${poolId}/candidates`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ candidateId });

      await request(app.getHttpServer())
        .post(`/api/v1/talent-pools/${poolId}/candidates`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ candidateId })
        .expect(409);
    });

    it('returns 404 for a pool belonging to another organization', async () => {
      const orgIdA = await registerAndApproveOrg('TagCrossA');
      const recruiterTokenA = await addStaffAndLogin(orgIdA, 'RECRUITER');
      const poolId = await createPool(recruiterTokenA, 'Strong Bench');

      const orgIdB = await registerAndApproveOrg('TagCrossB');
      const recruiterTokenB = await addStaffAndLogin(orgIdB, 'RECRUITER');
      const jobIdB = await createPublishedJob(recruiterTokenB);
      const { token: candidateTokenB, userId: candidateIdB } =
        await registerCandidateAndLogin('TagCrossB');
      await uploadCv(candidateTokenB);
      await applyToJob(candidateTokenB, jobIdB);

      await request(app.getHttpServer())
        .post(`/api/v1/talent-pools/${poolId}/candidates`)
        .set('Authorization', `Bearer ${recruiterTokenB}`)
        .send({ candidateId: candidateIdB })
        .expect(404);
    });
  });

  describe('DELETE /talent-pools/:id/candidates/:candidateId', () => {
    it('untags a candidate (happy path)', async () => {
      const orgId = await registerAndApproveOrg('UntagHappy');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');
      const jobId = await createPublishedJob(recruiterToken);
      const { token: candidateToken, userId: candidateId } =
        await registerCandidateAndLogin('UntagHappy');
      await uploadCv(candidateToken);
      await applyToJob(candidateToken, jobId);
      const poolId = await createPool(recruiterToken, 'Strong Bench');
      await request(app.getHttpServer())
        .post(`/api/v1/talent-pools/${poolId}/candidates`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ candidateId });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/talent-pools/${poolId}/candidates/${candidateId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      expect(res.body.candidates).toHaveLength(0);
    });

    it('returns 404 when the candidate is not in the pool', async () => {
      const orgId = await registerAndApproveOrg('UntagMissing');
      const recruiterToken = await addStaffAndLogin(orgId, 'RECRUITER');
      const poolId = await createPool(recruiterToken, 'Strong Bench');

      await request(app.getHttpServer())
        .delete(`/api/v1/talent-pools/${poolId}/candidates/nonexistent`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(404);
    });
  });
});
