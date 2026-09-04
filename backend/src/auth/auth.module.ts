import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_ACCESS_SECRET;
        if (!secret) {
          throw new Error('JWT_ACCESS_SECRET is not set -- see .env.example');
        }
        return {
          secret,
          signOptions: {
            expiresIn: (process.env.ACCESS_TOKEN_TTL ?? '15m') as StringValue,
          },
        };
      },
    }),
  ],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
