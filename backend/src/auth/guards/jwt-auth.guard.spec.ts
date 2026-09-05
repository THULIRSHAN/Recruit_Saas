import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AccessTokenPayload } from '../auth.service';

function createContext(headers: Record<string, string> = {}) {
  const request: {
    headers: Record<string, string>;
    user?: AccessTokenPayload;
  } = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('allows a route marked @Public() without checking for a token', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const jwt = { verify: jest.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(reflector, jwt);

    expect(guard.canActivate(createContext())).toBe(true);
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  it('rejects a request with no Authorization header', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const jwt = { verify: jest.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(reflector, jwt);

    expect(() => guard.canActivate(createContext())).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a non-Bearer Authorization header', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const jwt = { verify: jest.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(reflector, jwt);

    expect(() =>
      guard.canActivate(createContext({ authorization: 'Basic abc123' })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects an invalid or expired token', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const jwt = {
      verify: jest.fn().mockImplementation(() => {
        throw new Error('jwt expired');
      }),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(reflector, jwt);

    expect(() =>
      guard.canActivate(
        createContext({ authorization: 'Bearer bad.token.here' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('attaches the decoded payload to the request and allows the request through', () => {
    const payload: AccessTokenPayload = {
      sub: 'user-1',
      orgId: null,
      roles: [],
      isSuperAdmin: false,
      email: 'test@example.com',
      fullName: 'Test User',
    };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const jwt = {
      verify: jest.fn().mockReturnValue(payload),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(reflector, jwt);

    const context = createContext({ authorization: 'Bearer valid.token.here' });
    expect(guard.canActivate(context)).toBe(true);
    expect(
      context.switchToHttp().getRequest<{ user: AccessTokenPayload }>().user,
    ).toEqual(payload);
  });
});
