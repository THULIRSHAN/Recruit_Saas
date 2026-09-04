import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Interviews (e2e)', () => {
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
    const interviewerRole = await prisma.role.upsert({
      where: { key: 'INTERVIEWER' },
      update: {},
      create: { key: 'INTERVIEWER', name: 'Interviewer' },
    });
    // No interview:* permissions -- used for "correct org, wrong
    // permission" 403 tests, same role jobs.e2e-spec.ts uses for the
    // equivalent job:* case.
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
    await grantPermission(recruiterRole.id, 'interview:schedule');
    // Q24: REQ-EVAL-002 names Recruiter as an actor for the aggregate view.
    await grantPermission(recruiterRole.id, 'evaluation:read');
    await grantPermission(interviewerRole.id, 'interview:read');
    await grantPermission(interviewerRole.id, 'evaluation:submit');
    await grantPermission(candidateRole.id, 'application:create');
    await grantPermission(candidateRole.id, 'candidateProfile:update');
  });

  afterAll(async () => {
    // Interview has no onDelete: Cascade from Application, so it must be
    // deleted first (InterviewPanelMember cascades from Interview).
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
    await prisma.user.deleteMany({
      where: { email: { contains: '@interviews-e2e.test' } },
    });
    await prisma.organization.deleteMany({
      where: { name: { contains: 'Org Interviews E2E Test' } },
    });
    await app.close();
  });

  async function createSuperAdminAndLogin() {
    const email = `super-${Date.now()}-${Math.random().toString(36).slice(2)}@interviews-e2e.test`;
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
    const email = `${namePrefix}-owner-${Date.now()}@interviews-e2e.test`;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .send({
        organizationName: `Org Interviews E2E Test ${namePrefix} ${Date.now()}`,
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
    const email = `staff-${Date.now()}-${Math.random().toString(36).slice(2)}@interviews-e2e.test`;
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
    const email = `${namePrefix}-${Date.now()}@interviews-e2e.test`;
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

  // Bootstraps org + published job + an ACTIVE application + one
  // interviewer staff member, the common setup every test below needs.
  async function setUpApplicationWithInterviewer(namePrefix: string) {
    const orgId = await registerAndApproveOrg(namePrefix);
    const { token: recruiterToken } = await addStaffAndLogin(
      orgId,
      'RECRUITER',
    );
    const jobId = await createPublishedJob(recruiterToken);
    const candidateToken = await registerCandidateAndLogin(namePrefix);
    await uploadCv(candidateToken);
    const applicationId = await applyToJob(candidateToken, jobId);
    const { token: interviewerToken, userId: interviewerId } =
      await addStaffAndLogin(orgId, 'INTERVIEWER');
    return {
      orgId,
      recruiterToken,
      jobId,
      applicationId,
      interviewerToken,
      interviewerId,
    };
  }

  async function scheduleInterview(
    recruiterToken: string,
    jobId: string,
    applicationId: string,
    interviewerId: string,
  ) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/interviews`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        scheduledAt: '2026-03-01T10:00:00.000Z',
        mode: 'VIDEO',
        interviewerIds: [interviewerId],
      });
    return res.body.id as string;
  }

  describe('POST /jobs/:jobId/applications/:id/interviews', () => {
    it('schedules an interview with a valid panel (happy path)', async () => {
      const { recruiterToken, jobId, applicationId, interviewerId } =
        await setUpApplicationWithInterviewer('ScheduleHappy');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/interviews`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          scheduledAt: '2026-03-01T10:00:00.000Z',
          mode: 'VIDEO',
          interviewerIds: [interviewerId],
        })
        .expect(201);

      expect(res.body).toMatchObject({
        mode: 'VIDEO',
        status: 'SCHEDULED',
        panel: [{ interviewer: { id: interviewerId } }],
      });
    });

    it('returns 422 when an interviewerId does not belong to the organization', async () => {
      const { recruiterToken, jobId, applicationId } =
        await setUpApplicationWithInterviewer('ScheduleOutsider');
      const outsiderOrgId = await registerAndApproveOrg('ScheduleOutsider2');
      const { userId: outsiderId } = await addStaffAndLogin(
        outsiderOrgId,
        'INTERVIEWER',
      );

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/interviews`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          scheduledAt: '2026-03-01T10:00:00.000Z',
          mode: 'VIDEO',
          interviewerIds: [outsiderId],
        })
        .expect(422);
    });

    it('returns 409 when the application is not ACTIVE', async () => {
      const orgId = await registerAndApproveOrg('ScheduleWithdrawn');
      const { token: recruiterToken } = await addStaffAndLogin(
        orgId,
        'RECRUITER',
      );
      const jobId = await createPublishedJob(recruiterToken);
      const candidateToken =
        await registerCandidateAndLogin('ScheduleWithdrawn');
      await uploadCv(candidateToken);
      const applicationId = await applyToJob(candidateToken, jobId);
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationId}/withdraw`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .expect(201);
      const { userId: interviewerId } = await addStaffAndLogin(
        orgId,
        'INTERVIEWER',
      );

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/interviews`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          scheduledAt: '2026-03-01T10:00:00.000Z',
          mode: 'VIDEO',
          interviewerIds: [interviewerId],
        })
        .expect(409);
    });

    it('returns 404 for a job belonging to another organization', async () => {
      const { applicationId, interviewerId } =
        await setUpApplicationWithInterviewer('ScheduleCrossA');
      const orgIdB = await registerAndApproveOrg('ScheduleCrossB');
      const { token: recruiterTokenB } = await addStaffAndLogin(
        orgIdB,
        'RECRUITER',
      );
      const jobIdB = await createPublishedJob(recruiterTokenB);

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobIdB}/applications/${applicationId}/interviews`)
        .set('Authorization', `Bearer ${recruiterTokenB}`)
        .send({
          scheduledAt: '2026-03-01T10:00:00.000Z',
          mode: 'VIDEO',
          interviewerIds: [interviewerId],
        })
        .expect(404);
    });

    it('rejects a role without interview:schedule (e.g. Interviewer) with 403', async () => {
      const { jobId, applicationId, interviewerToken, interviewerId } =
        await setUpApplicationWithInterviewer('ScheduleForbidden');

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/interviews`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({
          scheduledAt: '2026-03-01T10:00:00.000Z',
          mode: 'VIDEO',
          interviewerIds: [interviewerId],
        })
        .expect(403);
    });

    it('rejects an unauthenticated request with 401', async () => {
      const { jobId, applicationId, interviewerId } =
        await setUpApplicationWithInterviewer('ScheduleUnauth');

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/interviews`)
        .send({
          scheduledAt: '2026-03-01T10:00:00.000Z',
          mode: 'VIDEO',
          interviewerIds: [interviewerId],
        })
        .expect(401);
    });
  });

  describe('POST .../interviews/:interviewId/reschedule', () => {
    it('marks the old interview RESCHEDULED and links to a newly created one', async () => {
      const { recruiterToken, jobId, applicationId, interviewerId } =
        await setUpApplicationWithInterviewer('RescheduleHappy');
      const scheduleRes = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/interviews`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          scheduledAt: '2026-03-01T10:00:00.000Z',
          mode: 'VIDEO',
          interviewerIds: [interviewerId],
        });
      const interviewId = scheduleRes.body.id as string;

      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/jobs/${jobId}/applications/${applicationId}/interviews/${interviewId}/reschedule`,
        )
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ scheduledAt: '2026-03-05T10:00:00.000Z' })
        .expect(201);

      expect(res.body.id).not.toBe(interviewId);
      // Same interviewer carried over, but as a fresh InterviewPanelMember
      // row (own id) tied to the new Interview, not a shared/moved one.
      expect(res.body.panel).toMatchObject([
        { interviewer: { id: interviewerId } },
      ]);

      const oldInterview = await prisma.interview.findUniqueOrThrow({
        where: { id: interviewId },
      });
      expect(oldInterview.status).toBe('RESCHEDULED');
      expect(oldInterview.rescheduledToId).toBe(res.body.id);
    });

    it('returns 409 when rescheduling an already-rescheduled interview', async () => {
      const { recruiterToken, jobId, applicationId, interviewerId } =
        await setUpApplicationWithInterviewer('RescheduleTwice');
      const scheduleRes = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/interviews`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          scheduledAt: '2026-03-01T10:00:00.000Z',
          mode: 'VIDEO',
          interviewerIds: [interviewerId],
        });
      const interviewId = scheduleRes.body.id as string;
      await request(app.getHttpServer())
        .post(
          `/api/v1/jobs/${jobId}/applications/${applicationId}/interviews/${interviewId}/reschedule`,
        )
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ scheduledAt: '2026-03-05T10:00:00.000Z' });

      await request(app.getHttpServer())
        .post(
          `/api/v1/jobs/${jobId}/applications/${applicationId}/interviews/${interviewId}/reschedule`,
        )
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ scheduledAt: '2026-03-06T10:00:00.000Z' })
        .expect(409);
    });
  });

  describe('GET /interviews/me', () => {
    it('lists only interviews the caller is a panel member of', async () => {
      const {
        recruiterToken,
        jobId,
        applicationId,
        interviewerToken,
        interviewerId,
      } = await setUpApplicationWithInterviewer('ListMine');
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/applications/${applicationId}/interviews`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          scheduledAt: '2026-03-01T10:00:00.000Z',
          mode: 'VIDEO',
          interviewerIds: [interviewerId],
        });

      const resAssigned = await request(app.getHttpServer())
        .get('/api/v1/interviews/me')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .expect(200);
      expect(resAssigned.body.data).toHaveLength(1);

      const otherOrgId = await registerAndApproveOrg('ListMineOther');
      const { token: otherInterviewerToken } = await addStaffAndLogin(
        otherOrgId,
        'INTERVIEWER',
      );
      const resUnassigned = await request(app.getHttpServer())
        .get('/api/v1/interviews/me')
        .set('Authorization', `Bearer ${otherInterviewerToken}`)
        .expect(200);
      expect(resUnassigned.body.data).toHaveLength(0);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/interviews/me')
        .expect(401);
    });
  });

  describe('POST /interviews/:interviewId/evaluation', () => {
    it("submits an evaluation for the caller's own panel assignment (happy path)", async () => {
      const {
        recruiterToken,
        jobId,
        applicationId,
        interviewerToken,
        interviewerId,
      } = await setUpApplicationWithInterviewer('EvalHappy');
      const interviewId = await scheduleInterview(
        recruiterToken,
        jobId,
        applicationId,
        interviewerId,
      );

      const res = await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/evaluation`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({
          scores: { communication: 4, technical: 5 },
          comment: 'Strong candidate.',
          recommendation: 'YES',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        scores: { communication: 4, technical: 5 },
        recommendation: 'YES',
      });
    });

    it('returns 400 when a score is outside 1-5', async () => {
      const {
        recruiterToken,
        jobId,
        applicationId,
        interviewerToken,
        interviewerId,
      } = await setUpApplicationWithInterviewer('EvalBadScore');
      const interviewId = await scheduleInterview(
        recruiterToken,
        jobId,
        applicationId,
        interviewerId,
      );

      await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/evaluation`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({ scores: { communication: 6 }, recommendation: 'YES' })
        .expect(400);
    });

    it('returns 409 on a second submission for the same interview', async () => {
      const {
        recruiterToken,
        jobId,
        applicationId,
        interviewerToken,
        interviewerId,
      } = await setUpApplicationWithInterviewer('EvalTwice');
      const interviewId = await scheduleInterview(
        recruiterToken,
        jobId,
        applicationId,
        interviewerId,
      );
      await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/evaluation`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({ scores: { communication: 4 }, recommendation: 'YES' });

      await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/evaluation`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({ scores: { communication: 3 }, recommendation: 'NO' })
        .expect(409);
    });

    it('returns 403 for an interviewer not assigned to this interview (docs/testing.md §3)', async () => {
      const { recruiterToken, jobId, applicationId, interviewerId, orgId } =
        await setUpApplicationWithInterviewer('EvalUnassigned');
      const interviewId = await scheduleInterview(
        recruiterToken,
        jobId,
        applicationId,
        interviewerId,
      );
      const { token: outsiderInterviewerToken } = await addStaffAndLogin(
        orgId,
        'INTERVIEWER',
      );

      await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/evaluation`)
        .set('Authorization', `Bearer ${outsiderInterviewerToken}`)
        .send({ scores: { communication: 4 }, recommendation: 'YES' })
        .expect(403);
    });

    it('rejects an unauthenticated request with 401', async () => {
      const { recruiterToken, jobId, applicationId, interviewerId } =
        await setUpApplicationWithInterviewer('EvalUnauth');
      const interviewId = await scheduleInterview(
        recruiterToken,
        jobId,
        applicationId,
        interviewerId,
      );

      await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/evaluation`)
        .send({ scores: { communication: 4 }, recommendation: 'YES' })
        .expect(401);
    });
  });

  describe('GET /jobs/:jobId/applications/:id/evaluations', () => {
    it('returns the aggregate evaluations for the application (happy path)', async () => {
      const {
        recruiterToken,
        jobId,
        applicationId,
        interviewerToken,
        interviewerId,
      } = await setUpApplicationWithInterviewer('EvalListHappy');
      const interviewId = await scheduleInterview(
        recruiterToken,
        jobId,
        applicationId,
        interviewerId,
      );
      await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/evaluation`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({ scores: { communication: 4 }, recommendation: 'YES' });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/applications/${applicationId}/evaluations`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        recommendation: 'YES',
        interviewer: { id: interviewerId },
      });
    });

    it('returns 404 for a job belonging to another organization', async () => {
      const { applicationId } =
        await setUpApplicationWithInterviewer('EvalListCrossA');
      const orgIdB = await registerAndApproveOrg('EvalListCrossB');
      const { token: recruiterTokenB } = await addStaffAndLogin(
        orgIdB,
        'RECRUITER',
      );
      const jobIdB = await createPublishedJob(recruiterTokenB);

      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobIdB}/applications/${applicationId}/evaluations`)
        .set('Authorization', `Bearer ${recruiterTokenB}`)
        .expect(404);
    });

    it('rejects a role without evaluation:read (e.g. Interviewer, who only holds evaluation:submit) with 403', async () => {
      const { jobId, applicationId, orgId } =
        await setUpApplicationWithInterviewer('EvalListForbidden');
      const { token: otherInterviewerToken } = await addStaffAndLogin(
        orgId,
        'INTERVIEWER',
      );

      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/applications/${applicationId}/evaluations`)
        .set('Authorization', `Bearer ${otherInterviewerToken}`)
        .expect(403);
    });

    it('rejects an unauthenticated request with 401', async () => {
      const { jobId, applicationId } =
        await setUpApplicationWithInterviewer('EvalListUnauth');

      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/applications/${applicationId}/evaluations`)
        .expect(401);
    });
  });
});
