import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  private readonly saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

  hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.saltRounds);
  }

  comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
