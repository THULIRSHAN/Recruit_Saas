import { AuthService } from './auth.service';

describe('AuthService', () => {
  const service = new AuthService();

  it('hashes a password and verifies it against the same plaintext', async () => {
    const hash = await service.hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
    await expect(
      service.comparePassword('correct-horse-battery-staple', hash),
    ).resolves.toBe(true);
  });

  it('rejects an incorrect plaintext against a valid hash', async () => {
    const hash = await service.hashPassword('correct-horse-battery-staple');
    await expect(service.comparePassword('wrong-password', hash)).resolves.toBe(
      false,
    );
  });
});
