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
    // Mirrors main.ts -- tests build their own app instance rather than
    // calling bootstrap(), so this isn't inherited automatically.
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    // /auth/refresh reads the refresh token from a cookie, which Express
    // doesn't parse without this middleware.
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

    // This file's own fixture data -- do NOT rely on database.e2e-spec.ts's
    // seed having already run against the shared real DB. Jest doesn't
    // guarantee cross-file execution order (parallel workers), so a test
    // here that happened to pass because another file's beforeAll ran
    // first would be a latent flake, not a real guarantee.
    await prisma.role.upsert({
      where: { key: 'RECRUITER' },
      update: {},
      create: { key: 'RECRUITER', name: 'Recruiter' },
    });
    await prisma.role.upsert({
      where: { key: 'COMPANY_OWNER' },
      update: {},
      create: { key: 'COMPANY_OWNER', name: 'Company Owner' },
    });
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
        .post('/api/v1/auth/register')
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
        .post('/api/v1/auth/register')
        .send({ email, password: 'short', fullName: 'Weak Password' })
        .expect(400);

      await expect(
        prisma.user.findUnique({ where: { email } }),
      ).resolves.toBeNull();
    });

    it('rejects an invalid email with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
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
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'password123',
          fullName: 'First Registration',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
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
        .get('/api/v1/auth/verify-email')
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
        .get('/api/v1/auth/verify-email')
        .query({ token: 'not-a-real-token' })
        .expect(400);
    });

    it('rejects a token that has already been used with 400', async () => {
      const user = await createCandidate('verify-used');
      const rawToken = await createToken(user.id, { usedAt: new Date() });

      await request(app.getHttpServer())
        .get('/api/v1/auth/verify-email')
        .query({ token: rawToken })
        .expect(400);
    });

    it('rejects an expired token with 400', async () => {
      const user = await createCandidate('verify-expired');
      const rawToken = await createToken(user.id, {
        expiresAt: new Date(Date.now() - 1000),
      });

      await request(app.getHttpServer())
        .get('/api/v1/auth/verify-email')
        .query({ token: rawToken })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with correct credentials, returning an access token and setting a refresh cookie', async () => {
      const user = await createCandidateWithPassword('login-ok', 'password123');

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
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
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'wrong-password' })
        .expect(401);

      expect(res.body.message).toBe('Invalid email or password.');
    });

    it('rejects an unknown email with the same generic 401 message', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
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
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'password123' })
        .expect(200);
      const cookie = loginRes.headers['set-cookie'] as unknown as string[];

      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
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
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('rejects a request with no refresh cookie at all', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .expect(401);
    });

    it('rejects an unknown refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', ['refresh_token=not-a-real-token'])
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the refresh token and clears the cookie', async () => {
      const user = await createCandidateWithPassword(
        'logout-ok',
        'password123',
      );
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'password123' })
        .expect(200);
      const cookie = loginRes.headers['set-cookie'] as unknown as string[];

      const logoutRes = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(200);
      expect(logoutRes.body).toEqual({ loggedOut: true });

      const clearedCookie = logoutRes.headers[
        'set-cookie'
      ] as unknown as string[];
      expect(clearedCookie.join(';')).toMatch(/refresh_token=;/);

      // The revoked token must no longer work for refresh.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('succeeds even with no refresh cookie (idempotent)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(200);
      expect(res.body).toEqual({ loggedOut: true });
    });

    it('succeeds even with an already-invalid token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', ['refresh_token=not-a-real-token'])
        .expect(200);
      expect(res.body).toEqual({ loggedOut: true });
    });
  });

  describe('POST /auth/forgot-password + POST /auth/reset-password', () => {
    it('returns the identical response for an existing and a non-existent email', async () => {
      const user = await createCandidateWithPassword(
        'forgot-exists',
        'password123',
      );

      const existsRes = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      const missingRes = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: `nobody-${Date.now()}@auth-e2e.test` })
        .expect(200);

      expect(existsRes.body).toEqual(missingRes.body);
    });

    it('resets the password with a valid token, then revokes existing sessions', async () => {
      const user = await createCandidateWithPassword(
        'reset-ok',
        'oldpassword123',
      );
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'oldpassword123' })
        .expect(200);
      const preResetCookie = loginRes.headers[
        'set-cookie'
      ] as unknown as string[];

      const rawToken = authService.generateOpaqueToken();
      await prisma.verificationToken.create({
        data: {
          userId: user.id,
          tokenHash: authService.hashOpaqueToken(rawToken),
          purpose: 'PASSWORD_RESET',
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: rawToken, newPassword: 'newpassword456' })
        .expect(200);

      // Old password no longer works.
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'oldpassword123' })
        .expect(401);

      // New password works.
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'newpassword456' })
        .expect(200);

      // Pre-reset session was force-revoked (old password may have been compromised).
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', preResetCookie)
        .expect(401);
    });

    it('rejects an unknown reset token with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'not-a-real-token', newPassword: 'newpassword456' })
        .expect(400);
    });

    it('rejects a weak new password with 400', async () => {
      const user = await createCandidateWithPassword(
        'reset-weak',
        'password123',
      );
      const rawToken = authService.generateOpaqueToken();
      await prisma.verificationToken.create({
        data: {
          userId: user.id,
          tokenHash: authService.hashOpaqueToken(rawToken),
          purpose: 'PASSWORD_RESET',
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: rawToken, newPassword: 'short' })
        .expect(400);
    });
  });

  describe('rate limiting', () => {
    // Every other test in this file runs with THROTTLE_ENABLED=false (see
    // jest-e2e.setup.ts) precisely so realistic-but-rapid legitimate test
    // traffic doesn't trip it -- this is the one place that deliberately
    // re-enables it, to prove the guard is actually wired up and blocking.
    it('blocks login after exceeding the per-IP limit (5 per 60s)', async () => {
      process.env.THROTTLE_ENABLED = 'true';
      try {
        const user = await createCandidateWithPassword(
          'throttle',
          'password123',
        );

        for (let i = 0; i < 5; i++) {
          await request(app.getHttpServer())
            .post('/api/v1/auth/login')
            .send({ email: user.email, password: 'wrong-password' });
        }

        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: user.email, password: 'wrong-password' })
          .expect(429);
      } finally {
        process.env.THROTTLE_ENABLED = 'false';
      }
    });
  });

  describe('GET /auth/me', () => {
    it('rejects a request with no access token', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('rejects a garbage token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
    });

    it('returns the decoded token payload for a valid access token', async () => {
      const user = await createCandidateWithPassword('me-ok', 'password123');
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'password123' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.accessToken as string}`)
        .expect(200);

      expect(res.body).toMatchObject({
        sub: user.id,
        orgId: null,
        roles: [],
        isSuperAdmin: false,
      });
    });

    it('populates orgId/roles at login for a user with exactly one org membership', async () => {
      const user = await createCandidateWithPassword(
        'me-single-org',
        'password123',
      );
      const org = await prisma.organization.create({
        data: { name: `Test Org ${Date.now()}` },
      });
      const recruiterRole = await prisma.role.findUniqueOrThrow({
        where: { key: 'RECRUITER' },
      });
      await prisma.userOrganizationRole.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          roleId: recruiterRole.id,
        },
      });

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'password123' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.accessToken as string}`)
        .expect(200);

      expect(res.body).toMatchObject({
        sub: user.id,
        orgId: org.id,
        roles: ['RECRUITER'],
      });

      await prisma.userOrganizationRole.deleteMany({
        where: { userId: user.id },
      });
      await prisma.organization.delete({ where: { id: org.id } });
    });

    it('leaves orgId/roles empty at login for a user with two org memberships', async () => {
      const user = await createCandidateWithPassword(
        'me-multi-org',
        'password123',
      );
      const org1 = await prisma.organization.create({
        data: { name: `Test Org A ${Date.now()}` },
      });
      const org2 = await prisma.organization.create({
        data: { name: `Test Org B ${Date.now()}` },
      });
      const ownerRole = await prisma.role.findUniqueOrThrow({
        where: { key: 'COMPANY_OWNER' },
      });
      await prisma.userOrganizationRole.createMany({
        data: [
          { userId: user.id, organizationId: org1.id, roleId: ownerRole.id },
          { userId: user.id, organizationId: org2.id, roleId: ownerRole.id },
        ],
      });

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'password123' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.accessToken as string}`)
        .expect(200);

      expect(res.body).toMatchObject({ sub: user.id, orgId: null, roles: [] });

      await prisma.userOrganizationRole.deleteMany({
        where: { userId: user.id },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [org1.id, org2.id] } },
      });
    });
  });

  describe('POST /auth/switch-org', () => {
    it('switches to a specific org membership and reflects it in the new token', async () => {
      const user = await createCandidateWithPassword(
        'switch-ok',
        'password123',
      );
      const org1 = await prisma.organization.create({
        data: { name: `Switch Org A ${Date.now()}` },
      });
      const org2 = await prisma.organization.create({
        data: { name: `Switch Org B ${Date.now()}` },
      });
      const ownerRole = await prisma.role.findUniqueOrThrow({
        where: { key: 'COMPANY_OWNER' },
      });
      await prisma.userOrganizationRole.createMany({
        data: [
          { userId: user.id, organizationId: org1.id, roleId: ownerRole.id },
          { userId: user.id, organizationId: org2.id, roleId: ownerRole.id },
        ],
      });

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'password123' })
        .expect(200);
      const loginCookie = loginRes.headers['set-cookie'] as unknown as string[];

      // Ambiguous at login (2 orgs) -- confirms the starting point.
      const meBeforeRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.accessToken as string}`)
        .expect(200);
      expect(meBeforeRes.body).toMatchObject({ orgId: null, roles: [] });

      const switchRes = await request(app.getHttpServer())
        .post('/api/v1/auth/switch-org')
        .set('Cookie', loginCookie)
        .send({ organizationId: org2.id })
        .expect(200);
      const switchCookie = switchRes.headers[
        'set-cookie'
      ] as unknown as string[];

      const meAfterRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${switchRes.body.accessToken as string}`)
        .expect(200);
      expect(meAfterRes.body).toMatchObject({
        sub: user.id,
        orgId: org2.id,
        roles: ['COMPANY_OWNER'],
      });

      // The pre-switch refresh token was rotated away by switch-org.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', loginCookie)
        .expect(401);
      // The post-switch one is live.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', switchCookie)
        .expect(200);

      await prisma.userOrganizationRole.deleteMany({
        where: { userId: user.id },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [org1.id, org2.id] } },
      });
    });

    it('returns 404 (not 403) when switching to an org the user is not a member of', async () => {
      const user = await createCandidateWithPassword(
        'switch-not-member',
        'password123',
      );
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'password123' })
        .expect(200);
      const cookie = loginRes.headers['set-cookie'] as unknown as string[];

      await request(app.getHttpServer())
        .post('/api/v1/auth/switch-org')
        .set('Cookie', cookie)
        .send({ organizationId: 'some-org-i-am-not-in' })
        .expect(404);
    });

    it('rejects a request with no refresh cookie', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/switch-org')
        .send({ organizationId: 'irrelevant' })
        .expect(401);
    });
  });
});
