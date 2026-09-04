import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('PipelineTemplatesController (e2e)', () => {
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
    // No pipeline:manage -- used for "correct org, wrong permission" 403
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
    await grantPermission(recruiterRole.id, 'pipeline:manage');
  });

  afterAll(async () => {
    // PipelineTemplate.organization has no onDelete: Cascade, so template
    // rows must be deleted before their Organization or the FK constraint
    // rejects the delete. PipelineStageTemplate cascades from
    // PipelineTemplate, so no separate cleanup needed for it.
    await prisma.pipelineTemplate.deleteMany({
      where: { organizationId: { in: orgIdsToClean } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: '@pipeline-e2e.test' } },
    });
    await prisma.organization.deleteMany({
      where: { name: { contains: 'Org Pipeline E2E Test' } },
    });
    await app.close();
  });

  async function createSuperAdminAndLogin() {
    const email = `super-${Date.now()}-${Math.random().toString(36).slice(2)}@pipeline-e2e.test`;
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
    const email = `${namePrefix}-owner-${Date.now()}@pipeline-e2e.test`;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .send({
        organizationName: `Org Pipeline E2E Test ${namePrefix} ${Date.now()}`,
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
    const email = `staff-${Date.now()}-${Math.random().toString(36).slice(2)}@pipeline-e2e.test`;
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

  async function createTemplate(
    token: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/pipeline-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Standard Pipeline',
        stages: ['Applied', 'Screening', 'Interview'],
        ...overrides,
      });
    return res.body.id as string;
  }

  describe('POST /pipeline-templates', () => {
    it('creates a template with ordered stages (happy path)', async () => {
      const orgId = await registerAndApproveOrg('CreateHappy');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');

      const res = await request(app.getHttpServer())
        .post('/api/v1/pipeline-templates')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Standard Pipeline', stages: ['Applied', 'Interview'] })
        .expect(201);

      expect(res.body).toMatchObject({
        organizationId: orgId,
        name: 'Standard Pipeline',
        stages: [
          { name: 'Applied', order: 0 },
          { name: 'Interview', order: 1 },
        ],
      });
    });

    it('rejects an empty stages array with 400', async () => {
      const orgId = await registerAndApproveOrg('CreateInvalid');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');

      await request(app.getHttpServer())
        .post('/api/v1/pipeline-templates')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Standard Pipeline', stages: [] })
        .expect(400);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/pipeline-templates')
        .send({ name: 'Standard Pipeline', stages: ['Applied'] })
        .expect(401);
    });

    it('rejects a role without pipeline:manage (e.g. Interviewer) with 403', async () => {
      const orgId = await registerAndApproveOrg('CreateForbidden');
      const token = await addStaffAndLogin(orgId, 'INTERVIEWER');

      await request(app.getHttpServer())
        .post('/api/v1/pipeline-templates')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Standard Pipeline', stages: ['Applied'] })
        .expect(403);
    });
  });

  describe('GET /pipeline-templates/:id', () => {
    it('returns a template scoped to the caller org (happy path)', async () => {
      const orgId = await registerAndApproveOrg('GetOneHappy');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const templateId = await createTemplate(token);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/pipeline-templates/${templateId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({ id: templateId, organizationId: orgId });
    });

    it('returns 404 for a cross-tenant template (correct role, wrong org) and leaks no data', async () => {
      const orgAId = await registerAndApproveOrg('CrossTenantA');
      const tokenA = await addStaffAndLogin(orgAId, 'RECRUITER');
      const templateId = await createTemplate(tokenA, {
        name: 'Org A Secret Pipeline',
      });

      const orgBId = await registerAndApproveOrg('CrossTenantB');
      const tokenB = await addStaffAndLogin(orgBId, 'RECRUITER');

      const res = await request(app.getHttpServer())
        .get(`/api/v1/pipeline-templates/${templateId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      expect(JSON.stringify(res.body)).not.toContain('Org A Secret Pipeline');
    });

    it('returns 404 for a nonexistent template id', async () => {
      const orgId = await registerAndApproveOrg('GetOneNotFound');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');

      await request(app.getHttpServer())
        .get('/api/v1/pipeline-templates/does-not-exist')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PATCH /pipeline-templates/:id', () => {
    it('replaces the stage list wholesale (happy path)', async () => {
      const orgId = await registerAndApproveOrg('PatchHappy');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const templateId = await createTemplate(token);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/pipeline-templates/${templateId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ stages: ['Applied', 'Offer'] })
        .expect(200);

      expect(res.body.stages).toEqual([
        { id: expect.any(String) as string, name: 'Applied', order: 0 },
        { id: expect.any(String) as string, name: 'Offer', order: 1 },
      ]);
    });

    it('returns 404 for a cross-tenant template, without modifying it', async () => {
      const orgAId = await registerAndApproveOrg('PatchCrossTenantA');
      const tokenA = await addStaffAndLogin(orgAId, 'RECRUITER');
      const templateId = await createTemplate(tokenA, {
        name: 'Org A Original Name',
      });

      const orgBId = await registerAndApproveOrg('PatchCrossTenantB');
      const tokenB = await addStaffAndLogin(orgBId, 'RECRUITER');

      await request(app.getHttpServer())
        .patch(`/api/v1/pipeline-templates/${templateId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Hijacked Name' })
        .expect(404);

      const template = await prisma.pipelineTemplate.findUniqueOrThrow({
        where: { id: templateId },
      });
      expect(template.name).toBe('Org A Original Name');
    });
  });

  describe('DELETE /pipeline-templates/:id', () => {
    it('deletes a template scoped to the caller org (happy path)', async () => {
      const orgId = await registerAndApproveOrg('DeleteHappy');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const templateId = await createTemplate(token);

      await request(app.getHttpServer())
        .delete(`/api/v1/pipeline-templates/${templateId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await expect(
        prisma.pipelineTemplate.findUnique({ where: { id: templateId } }),
      ).resolves.toBeNull();
    });

    it('returns 404 for a cross-tenant template, without deleting it', async () => {
      const orgAId = await registerAndApproveOrg('DeleteCrossTenantA');
      const tokenA = await addStaffAndLogin(orgAId, 'RECRUITER');
      const templateId = await createTemplate(tokenA);

      const orgBId = await registerAndApproveOrg('DeleteCrossTenantB');
      const tokenB = await addStaffAndLogin(orgBId, 'RECRUITER');

      await request(app.getHttpServer())
        .delete(`/api/v1/pipeline-templates/${templateId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      await expect(
        prisma.pipelineTemplate.findUnique({ where: { id: templateId } }),
      ).resolves.not.toBeNull();
    });
  });

  describe('GET /pipeline-templates', () => {
    it('lists only the caller org’s own templates', async () => {
      const orgId = await registerAndApproveOrg('ListMine');
      const token = await addStaffAndLogin(orgId, 'RECRUITER');
      const templateId = await createTemplate(token);

      const res = await request(app.getHttpServer())
        .get('/api/v1/pipeline-templates')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const ids = (res.body.data as Array<{ id: string }>).map((t) => t.id);
      expect(ids).toContain(templateId);
    });
  });
});
