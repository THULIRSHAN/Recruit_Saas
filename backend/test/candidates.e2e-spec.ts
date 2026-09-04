import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('CandidatesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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

    // This file's own fixture -- see auth.e2e-spec.ts for why (Jest doesn't
    // guarantee cross-file seed ordering against the shared real DB).
    // CANDIDATE is "implicit" only in the sense of no UserOrganizationRole
    // row (docs/open-questions.md Q11) -- the Role/Permission/RolePermission
    // catalog rows themselves must still exist for PermissionsGuard's
    // rolePermission lookup to grant candidateProfile:update.
    const candidateRole = await prisma.role.upsert({
      where: { key: 'CANDIDATE' },
      update: {},
      create: { key: 'CANDIDATE', name: 'Candidate' },
    });
    const permission = await prisma.permission.upsert({
      where: { key: 'candidateProfile:update' },
      update: {},
      create: { key: 'candidateProfile:update' },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: candidateRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: { roleId: candidateRole.id, permissionId: permission.id },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: '@candidates-e2e.test' } },
    });
    await app.close();
  });

  async function registerAndLogin(namePrefix: string) {
    const email = `${namePrefix}-${Date.now()}@candidates-e2e.test`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', fullName: 'Test Candidate' });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    return loginRes.body.accessToken as string;
  }

  describe('GET /candidates/me', () => {
    it('returns a synthesized empty profile before any write (happy path)', async () => {
      const token = await registerAndLogin('GetEmpty');

      const res = await request(app.getHttpServer())
        .get('/api/v1/candidates/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({
        headline: null,
        location: null,
        phone: null,
        education: [],
        experience: [],
        skills: [],
        cvs: [],
      });
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/candidates/me')
        .expect(401);
    });
  });

  describe('PATCH /candidates/me', () => {
    it('creates the profile on first write, then updates it in place (happy path)', async () => {
      const token = await registerAndLogin('PatchHappy');

      const createRes = await request(app.getHttpServer())
        .patch('/api/v1/candidates/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ headline: 'Software Engineer', location: 'Remote' })
        .expect(200);
      expect(createRes.body).toMatchObject({
        headline: 'Software Engineer',
        location: 'Remote',
      });

      const updateRes = await request(app.getHttpServer())
        .patch('/api/v1/candidates/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '555-1234' })
        .expect(200);
      // Partial update -- previously-set fields survive untouched.
      expect(updateRes.body).toMatchObject({
        headline: 'Software Engineer',
        location: 'Remote',
        phone: '555-1234',
      });
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/candidates/me')
        .send({ headline: 'Nope' })
        .expect(401);
    });

    it("does not allow updating another user's profile (no :id exists to tamper with)", async () => {
      const tokenA = await registerAndLogin('IsolationA');
      const tokenB = await registerAndLogin('IsolationB');

      await request(app.getHttpServer())
        .patch('/api/v1/candidates/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ headline: 'Candidate A Headline' })
        .expect(200);

      await request(app.getHttpServer())
        .patch('/api/v1/candidates/me')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ headline: 'Candidate B Headline' })
        .expect(200);

      const resA = await request(app.getHttpServer())
        .get('/api/v1/candidates/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(resA.body.headline).toBe('Candidate A Headline');
    });
  });

  describe('PATCH /candidates/me/education', () => {
    it('replaces the education list wholesale (happy path)', async () => {
      const token = await registerAndLogin('EducationHappy');

      const res = await request(app.getHttpServer())
        .patch('/api/v1/candidates/me/education')
        .set('Authorization', `Bearer ${token}`)
        .send({
          education: [
            {
              institution: 'MIT',
              degree: 'BSc',
              startYear: 2018,
              endYear: 2022,
            },
          ],
        })
        .expect(200);

      expect(res.body).toMatchObject([
        { institution: 'MIT', degree: 'BSc', startYear: 2018, endYear: 2022 },
      ]);

      const replaceRes = await request(app.getHttpServer())
        .patch('/api/v1/candidates/me/education')
        .set('Authorization', `Bearer ${token}`)
        .send({ education: [{ institution: 'Stanford' }] })
        .expect(200);

      expect(replaceRes.body).toHaveLength(1);
      expect(replaceRes.body[0]).toMatchObject({ institution: 'Stanford' });
    });

    it('rejects a missing institution with 400', async () => {
      const token = await registerAndLogin('EducationInvalid');

      await request(app.getHttpServer())
        .patch('/api/v1/candidates/me/education')
        .set('Authorization', `Bearer ${token}`)
        .send({ education: [{ degree: 'BSc' }] })
        .expect(400);
    });
  });

  describe('PATCH /candidates/me/experience', () => {
    it('replaces the experience list wholesale (happy path)', async () => {
      const token = await registerAndLogin('ExperienceHappy');

      const res = await request(app.getHttpServer())
        .patch('/api/v1/candidates/me/experience')
        .set('Authorization', `Bearer ${token}`)
        .send({
          experience: [
            {
              company: 'Acme',
              title: 'Engineer',
              startDate: '2020-01-01',
            },
          ],
        })
        .expect(200);

      expect(res.body).toMatchObject([{ company: 'Acme', title: 'Engineer' }]);
    });
  });

  describe('PATCH /candidates/me/skills', () => {
    it('replaces the skills list wholesale (happy path)', async () => {
      const token = await registerAndLogin('SkillsHappy');

      const res = await request(app.getHttpServer())
        .patch('/api/v1/candidates/me/skills')
        .set('Authorization', `Bearer ${token}`)
        .send({ skills: ['TypeScript', 'React'] })
        .expect(200);

      const names = (res.body as Array<{ name: string }>).map((s) => s.name);
      expect(names).toEqual(['TypeScript', 'React']);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/candidates/me/skills')
        .send({ skills: ['TypeScript'] })
        .expect(401);
    });
  });
});
