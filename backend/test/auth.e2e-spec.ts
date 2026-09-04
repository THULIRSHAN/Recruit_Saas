import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirrors main.ts -- /auth/refresh reads the refresh token from a
    // cookie, which Express doesn't parse without this middleware.
    app.use(cookieParser());
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
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: '@auth-e2e.test' } },
    });
    await app.close();
  });

  async function createCandidateWithPassword(
    emailSuffix: string,
    password: string,
  ) {
    const email = `${emailSuffix}-${Date.now()}@auth-e2e.test`;
    const passwordHash = await authService.hashPassword(password);
    return prisma.user.create({
      data: { email, passwordHash, fullName: 'Login Test' },
    });
  }

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

  describe('GET /auth/verify-email', () => {
    async function createCandidate(emailSuffix: string) {
      const email = `${emailSuffix}-${Date.now()}@auth-e2e.test`;
      const user = await prisma.user.create({
        data: { email, passwordHash: 'irrelevant', fullName: 'Verify Test' },
      });
      return user;
    }

    async function createToken(
      userId: string,
      overrides: { usedAt?: Date; expiresAt?: Date } = {},
    ) {
      const rawToken = authService.generateOpaqueToken();
      await prisma.verificationToken.create({
        data: {
          userId,
          tokenHash: authService.hashOpaqueToken(rawToken),
          purpose: 'EMAIL_VERIFICATION',
          expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
          usedAt: overrides.usedAt ?? null,
        },
      });
      return rawToken;
    }

    it('marks the user verified for a valid token', async () => {
      const user = await createCandidate('verify-ok');
      const rawToken = await createToken(user.id);

      const res = await request(app.getHttpServer())
        .get('/auth/verify-email')
        .query({ token: rawToken })
        .expect(200);

      expect(res.body).toEqual({ verified: true });
      const updated = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(updated.emailVerified).toBe(true);
    });

    it('rejects an unknown token with 400', async () => {
      await request(app.getHttpServer())
        .get('/auth/verify-email')
        .query({ token: 'not-a-real-token' })
        .expect(400);
    });

    it('rejects a token that has already been used with 400', async () => {
      const user = await createCandidate('verify-used');
      const rawToken = await createToken(user.id, { usedAt: new Date() });

      await request(app.getHttpServer())
        .get('/auth/verify-email')
        .query({ token: rawToken })
        .expect(400);
    });

    it('rejects an expired token with 400', async () => {
      const user = await createCandidate('verify-expired');
      const rawToken = await createToken(user.id, {
        expiresAt: new Date(Date.now() - 1000),
      });

      await request(app.getHttpServer())
        .get('/auth/verify-email')
        .query({ token: rawToken })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with correct credentials, returning an access token and setting a refresh cookie', async () => {
      const user = await createCandidateWithPassword('login-ok', 'password123');

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: 'password123' })
        .expect(200);

      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body).not.toHaveProperty('refreshToken');

      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const cookieHeader = Array.isArray(setCookie)
        ? setCookie.join(';')
        : String(setCookie);
      expect(cookieHeader).toMatch(/refresh_token=/);
      expect(cookieHeader).toMatch(/HttpOnly/i);
    });

    it('rejects a wrong password with a generic 401', async () => {
      const user = await createCandidateWithPassword(
        'login-wrong-pw',
        'password123',
      );

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: 'wrong-password' })
        .expect(401);

      expect(res.body.message).toBe('Invalid email or password.');
    });

    it('rejects an unknown email with the same generic 401 message', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: `nobody-${Date.now()}@auth-e2e.test`,
          password: 'password123',
        })
        .expect(401);

      expect(res.body.message).toBe('Invalid email or password.');
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token and issues a new access token', async () => {
      const user = await createCandidateWithPassword(
        'refresh-ok',
        'password123',
      );
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: 'password123' })
        .expect(200);
      const cookie = loginRes.headers['set-cookie'] as unknown as string[];

      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);

      expect(typeof refreshRes.body.accessToken).toBe('string');
      const newCookie = refreshRes.headers['set-cookie'] as unknown as string[];
      expect(newCookie).toBeDefined();
      // The opaque refresh token itself must differ (unlike the JWT access
      // token's claims, which can legitimately collide when login+refresh
      // happen within the same iat/exp second) -- this is what "rotation"
      // actually means.
      expect(newCookie.join(';')).not.toBe(cookie.join(';'));

      // The old cookie was revoked by the rotation above -- replaying it
      // must fail, which is what makes a stolen-and-reused token detectable.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('rejects a request with no refresh cookie at all', async () => {
      await request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });

    it('rejects an unknown refresh token', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', ['refresh_token=not-a-real-token'])
        .expect(401);
    });
  });
});
