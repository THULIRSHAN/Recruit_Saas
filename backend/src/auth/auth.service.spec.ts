import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

function createPrismaMock() {
  return {
    user: { create: jest.fn(), update: jest.fn() },
    verificationToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  } as unknown as PrismaService;
}

describe('AuthService', () => {
  describe('password hashing', () => {
    const service = new AuthService(createPrismaMock());

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
    const service = new AuthService(createPrismaMock());

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
      const service = new AuthService(prisma);

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
      const service = new AuthService(prisma);

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
      const token = 'raw-token';
      const service = new AuthService(prisma);
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

      await expect(service.verifyEmail(token)).resolves.toEqual({
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
      const service = new AuthService(prisma);

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
      const service = new AuthService(prisma);

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
      const service = new AuthService(prisma);

      await expect(service.verifyEmail('expired-token')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
