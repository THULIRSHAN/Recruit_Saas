import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('OrganizationsController (e2e)', () => {
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
    await prisma.role.upsert({
      where: { key: 'COMPANY_OWNER' },
      update: {},
      create: { key: 'COMPANY_OWNER', name: 'Company Owner' },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: '@org-e2e.test' } },
    });
    await prisma.organization.deleteMany({
      where: { name: { contains: 'Org E2E Test' } },
    });
    await app.close();
  });

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
});
