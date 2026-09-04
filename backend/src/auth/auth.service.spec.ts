import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

function createPrismaMock() {
  return {
    user: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    verificationToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  } as unknown as PrismaService;
}

function createService(prisma: PrismaService) {
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
  } as unknown as JwtService;
  return new AuthService(prisma, jwt);
}

describe('AuthService', () => {
  describe('password hashing', () => {
    const service = createService(createPrismaMock());

    it('hashes a password and verifies it against the same plaintext', async () => {
      const hash = await service.hashPassword('correct-horse-battery-staple');
      expect(hash).not.toBe('correct-horse-battery-staple');
      await expect(
        service.comparePassword('correct-horse-battery-staple', hash),
      ).resolves.toBe(true);
    });

    it('rejects an incorrect plaintext against a valid hash', async () => {
      const hash = await service.hashPassword('correct-horse-battery-staple');
      await expect(
        service.comparePassword('wrong-password', hash),
      ).resolves.toBe(false);
    });
  });

  describe('opaque tokens', () => {
    const service = createService(createPrismaMock());

    it('generates a different token every call', () => {
      expect(service.generateOpaqueToken()).not.toBe(
        service.generateOpaqueToken(),
      );
    });

    it('hashes a token deterministically, so it can be looked up by exact match', () => {
      const token = service.generateOpaqueToken();
      expect(service.hashOpaqueToken(token)).toBe(
        service.hashOpaqueToken(token),
      );
    });
  });

  describe('register', () => {
    it('creates a user, issues a verification token, and never returns the password hash', async () => {
      const prisma = createPrismaMock();
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'candidate@example.com',
        fullName: 'Ada Lovelace',
        emailVerified: false,
        passwordHash: 'should-never-be-returned',
      });
      const service = createService(prisma);

      const result = await service.register({
        email: 'candidate@example.com',
        password: 'password123',
        fullName: 'Ada Lovelace',
      });

      expect(result).toEqual({
        id: 'user-1',
        email: 'candidate@example.com',
        fullName: 'Ada Lovelace',
        emailVerified: false,
      });
      expect(result).not.toHaveProperty('passwordHash');
      expect(prisma.verificationToken.create).toHaveBeenCalledTimes(1);
    });

    it('throws a generic 409 on duplicate email, without confirming which field failed', async () => {
      const prisma = createPrismaMock();
      (prisma.user.create as jest.Mock).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const service = createService(prisma);

      await expect(
        service.register({
          email: 'dup@example.com',
          password: 'password123',
          fullName: 'Dup User',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('verifyEmail', () => {
    it('marks the user verified for a valid, unused, unexpired token', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);
      (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'vt-1',
        userId: 'user-1',
        purpose: 'EMAIL_VERIFICATION',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      (prisma.verificationToken.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      await expect(service.verifyEmail('raw-token')).resolves.toEqual({
        verified: true,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerified: true },
      });
    });

    it('rejects an unknown token', async () => {
      const prisma = createPrismaMock();
      (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      const service = createService(prisma);

      await expect(service.verifyEmail('bogus')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an already-used token', async () => {
      const prisma = createPrismaMock();
      (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'vt-1',
        userId: 'user-1',
        purpose: 'EMAIL_VERIFICATION',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      const service = createService(prisma);

      await expect(service.verifyEmail('used-token')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an expired token', async () => {
      const prisma = createPrismaMock();
      (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'vt-1',
        userId: 'user-1',
        purpose: 'EMAIL_VERIFICATION',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1),
      });
      const service = createService(prisma);

      await expect(service.verifyEmail('expired-token')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('login', () => {
    it('issues an access + refresh token pair for correct credentials', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);
      const passwordHash = await service.hashPassword('password123');
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'candidate@example.com',
        passwordHash,
        isSuperAdmin: false,
      });

      const result = await service.login({
        email: 'candidate@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(typeof result.refreshToken).toBe('string');
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('rejects an unknown email with a generic 401', async () => {
      const prisma = createPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = createService(prisma);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong password with the same generic 401 as an unknown email', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);
      const passwordHash = await service.hashPassword('correct-password');
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'candidate@example.com',
        passwordHash,
        isSuperAdmin: false,
      });

      await expect(
        service.login({
          email: 'candidate@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates the token: revokes the old one and issues a new pair', async () => {
      const prisma = createPrismaMock();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'rt-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 'user-1', isSuperAdmin: false },
      });
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      const service = createService(prisma);

      const result = await service.refresh('old-raw-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('rejects an unknown token', async () => {
      const prisma = createPrismaMock();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);
      const service = createService(prisma);

      await expect(service.refresh('bogus')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an already-revoked token (replay of a rotated token)', async () => {
      const prisma = createPrismaMock();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'rt-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 'user-1', isSuperAdmin: false },
      });
      const service = createService(prisma);

      await expect(service.refresh('revoked-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an expired token', async () => {
      const prisma = createPrismaMock();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'rt-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1),
        user: { id: 'user-1', isSuperAdmin: false },
      });
      const service = createService(prisma);

      await expect(service.refresh('expired-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a losing race when the same token is replayed concurrently', async () => {
      const prisma = createPrismaMock();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'rt-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 'user-1', isSuperAdmin: false },
      });
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      const service = createService(prisma);

      await expect(service.refresh('raced-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes the presented refresh token', async () => {
      const prisma = createPrismaMock();
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      const service = createService(prisma);

      await service.logout('some-raw-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          tokenHash: service.hashOpaqueToken('some-raw-token'),
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('is a no-op (does not throw) when no token is presented', async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.logout(undefined)).resolves.toBeUndefined();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('issues a reset token when the email exists', async () => {
      const prisma = createPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'candidate@example.com',
      });
      const service = createService(prisma);

      await service.forgotPassword({ email: 'candidate@example.com' });

      expect(prisma.verificationToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          purpose: 'PASSWORD_RESET',
        }) as object,
      });
    });

    it('does nothing (but does not throw) when the email does not exist', async () => {
      const prisma = createPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = createService(prisma);

      await expect(
        service.forgotPassword({ email: 'nobody@example.com' }),
      ).resolves.toBeUndefined();
      expect(prisma.verificationToken.create).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('updates the password and revokes all existing refresh tokens', async () => {
      const prisma = createPrismaMock();
      (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'vt-1',
        userId: 'user-1',
        purpose: 'PASSWORD_RESET',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      (prisma.verificationToken.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });
      const service = createService(prisma);

      await service.resetPassword({
        token: 'raw-token',
        newPassword: 'newpassword123',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String) as string },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('rejects an unknown token', async () => {
      const prisma = createPrismaMock();
      (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      const service = createService(prisma);

      await expect(
        service.resetPassword({
          token: 'bogus',
          newPassword: 'newpassword123',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a token that is for the wrong purpose (email verification, not password reset)', async () => {
      const prisma = createPrismaMock();
      (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'vt-1',
        userId: 'user-1',
        purpose: 'EMAIL_VERIFICATION',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const service = createService(prisma);

      await expect(
        service.resetPassword({
          token: 'wrong-purpose',
          newPassword: 'newpassword123',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
