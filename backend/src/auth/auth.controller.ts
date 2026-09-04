import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SwitchOrgDto } from './dto/switch-org.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import {
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
  refreshCookieOptions,
} from './refresh-cookie';
import type { AccessTokenPayload } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Tighter than the 20/60s global default (see AppModule) -- these are the
  // endpoints security.md §7 specifically calls out for brute-force/scraping
  // risk. /auth/refresh deliberately keeps the global default: it's used by
  // every legitimate active session on every token expiry, not just at
  // attack-prone entry points.
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Get('verify-email')
  verifyEmail(@Query() query: VerifyEmailDto) {
    return this.authService.verifyEmail(query.token);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.login(dto);
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, refreshCookieOptions());
    return { accessToken };
  }

  // Public with respect to the access token guard -- authenticated by the
  // refresh cookie instead, checked internally.
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presentedToken: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (typeof presentedToken !== 'string') {
      throw new UnauthorizedException('Missing refresh token.');
    }

    const { accessToken, refreshToken } =
      await this.authService.refresh(presentedToken);
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, refreshCookieOptions());
    return { accessToken };
  }

  // Public with respect to the access token guard, same reasoning as
  // refresh -- an expired/already-invalid access token shouldn't block
  // logging out.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presentedToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
      string | undefined;
    await this.authService.logout(presentedToken);
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_TOKEN_COOKIE_PATH });
    return { loggedOut: true };
  }

  // Public with respect to the access token guard, same reasoning as
  // refresh -- authenticated by the refresh cookie, which remains valid
  // even if the access token has since expired (no need to refresh first
  // just to then switch org in a second round trip).
  @Public()
  @Post('switch-org')
  @HttpCode(HttpStatus.OK)
  async switchOrg(
    @Body() dto: SwitchOrgDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presentedToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
      string | undefined;
    if (typeof presentedToken !== 'string') {
      throw new UnauthorizedException('Missing refresh token.');
    }

    const { accessToken, refreshToken } = await this.authService.switchOrg(
      presentedToken,
      dto,
    );
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, refreshCookieOptions());
    return { accessToken };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    // Identical response whether or not the email exists -- see
    // AuthService.forgotPassword.
    return {
      message: 'If that email is registered, a reset link has been sent.',
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: 'Password has been reset.' };
  }

  // First protected endpoint -- proves JwtAuthGuard actually enforces
  // authentication end-to-end (M4.1). Returns the token payload as-is;
  // deliberately minimal since there's no user-profile module yet.
  @Get('me')
  me(@CurrentUser() user: AccessTokenPayload) {
    return user;
  }
}
