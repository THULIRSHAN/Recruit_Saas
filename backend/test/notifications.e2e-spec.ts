import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Notifications (e2e)', () => {
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
    // No permission grant needed -- being scheduled as an interviewer only
    // requires org membership (InterviewsService.requireOrgMembers()), not
    // any specific permission.
    await prisma.role.upsert({
      where: { key: 'INTERVIEWER' },
      update: {},
      create: { key: 'INTERVIEWER', name: 'Interviewer' },
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
    await grantPermission(recruiterRole.id, 'application:read');
    await grantPermission(recruiterRole.id, 'application:screen');
    await grantPermission(recruiterRole.id, 'interview:schedule');
    await grantPermission(candidateRole.id, 'application:create');
    await grantPermission(candidateRole.id, 'candidateProfile:update');
  });

  afterAll(async () => {
    await prisma.interview.deleteMany({
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
    await prisma.notification.deleteMany({
      where: { user: { email: { contains: '@notifications-e2e.test' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: '@notifications-e2e.test' } },
    });
    await prisma.organization.deleteMany({
      where: { name: { contains: 'Org Notifications E2E Test' } },
    });
    await app.close();
  });

  async function createSuperAdminAndLogin() {
    const email = `super-${Date.now()}-${Math.random().toString(36).slice(2)}@notifications-e2e.test`;
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
    const email = `${namePrefix}-owner-${Date.now()}@notifications-e2e.test`;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .send({
        organizationName: `Org Notifications E2E Test ${namePrefix} ${Date.now()}`,
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
    const email = `staff-${Date.now()}-${Math.random().toString(36).slice(2)}@notifications-e2e.test`;
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
    return { token: loginRes.body.accessToken as string, userId: user.id };
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
    const email = `${namePrefix}-${Date.now()}@notifications-e2e.test`;
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

  describe('screening rejection notifies the candidate', () => {
    it('creates a notification the candidate can read and mark read', async () => {
      const orgId = await registerAndApproveOrg('ScreenReject');
      const { token: recruiterToken } = await addStaffAndLogin(
        orgId,
        'RECRUITER',
      );
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken = await registerCandidateAndLogin('ScreenReject');
      await uploadCv(candidateToken);
      const applicationId = await applyToJob(candidateToken, jobId);

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/screen`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ decision: 'REJECT', reason: 'Not a fit.' })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/me')
        .set('Authorization', `Bearer ${candidateToken}`)
        .expect(200);
      expect(listRes.body.data).toHaveLength(1);
      const notification = listRes.body.data[0];
      expect(notification).toMatchObject({
        type: 'application.rejected',
        readAt: null,
        payload: {
          applicationId,
          reason: 'Not a fit.',
          source: 'screening',
        },
      });

      const markReadRes = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notification.id}/read`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .expect(200);
      expect(markReadRes.body.readAt).not.toBeNull();

      // Idempotent -- reading twice doesn't error or change the value.
      const secondMarkReadRes = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notification.id}/read`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .expect(200);
      expect(secondMarkReadRes.body.readAt).toBe(markReadRes.body.readAt);
    });

    it("returns 404 marking another user's notification as read", async () => {
      const orgId = await registerAndApproveOrg('ScreenRejectCross');
      const { token: recruiterToken } = await addStaffAndLogin(
        orgId,
        'RECRUITER',
      );
      const jobId = await createPublishedJob(recruiterToken);
      const candidateTokenA =
        await registerCandidateAndLogin('ScreenRejectCrossA');
      await uploadCv(candidateTokenA);
      const applicationId = await applyToJob(candidateTokenA, jobId);
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/screen`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ decision: 'REJECT' });
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/me')
        .set('Authorization', `Bearer ${candidateTokenA}`);
      const notificationId = listRes.body.data[0].id as string;

      const candidateTokenB =
        await registerCandidateAndLogin('ScreenRejectCrossB');
      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${candidateTokenB}`)
        .expect(404);
    });
  });

  describe('interview scheduling notifies each interviewer', () => {
    it('creates a notification for the assigned interviewer', async () => {
      const orgId = await registerAndApproveOrg('InterviewScheduled');
      const { token: recruiterToken } = await addStaffAndLogin(
        orgId,
        'RECRUITER',
      );
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken =
        await registerCandidateAndLogin('InterviewScheduled');
      await uploadCv(candidateToken);
      const applicationId = await applyToJob(candidateToken, jobId);
      const { token: interviewerToken, userId: interviewerId } =
        await addStaffAndLogin(orgId, 'INTERVIEWER');

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/interviews`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          scheduledAt: '2026-03-01T10:00:00.000Z',
          mode: 'VIDEO',
          interviewerIds: [interviewerId],
        })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/me')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .expect(200);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0]).toMatchObject({
        type: 'interview.scheduled',
        payload: { applicationId },
      });
    });
  });

  describe('GET /notifications/me', () => {
    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/notifications/me')
        .expect(401);
    });
  });
});
