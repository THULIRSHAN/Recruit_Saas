import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: '@auth-e2e.test' } },
    });
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('registers a new candidate and never returns the password hash', async () => {
      const email = `register-${Date.now()}@auth-e2e.test`;

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'password123', fullName: 'Ada Lovelace' })
        .expect(201);

      expect(res.body).toMatchObject({
        email,
        fullName: 'Ada Lovelace',
        emailVerified: false,
      });
      expect(res.body).toHaveProperty('id');
      expect(res.body).not.toHaveProperty('passwordHash');

      const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(stored.passwordHash).not.toBe('password123');
    });

    it('rejects a weak password with 400', async () => {
      const email = `weak-${Date.now()}@auth-e2e.test`;

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'short', fullName: 'Weak Password' })
        .expect(400);

      await expect(
        prisma.user.findUnique({ where: { email } }),
      ).resolves.toBeNull();
    });

    it('rejects an invalid email with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'not-an-email',
          password: 'password123',
          fullName: 'Bad Email',
        })
        .expect(400);
    });

    it('returns a generic 409 on duplicate email, without leaking which field failed', async () => {
      const email = `duplicate-${Date.now()}@auth-e2e.test`;
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email,
          password: 'password123',
          fullName: 'First Registration',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email,
          password: 'password123',
          fullName: 'Second Registration',
        })
        .expect(409);

      expect(res.body.message).not.toMatch(/email/i);
    });
  });
});
