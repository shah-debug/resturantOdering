import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { MeResponse, MessageResponse } from '@app/contracts';
import type { Request, Response } from 'express';
import { AppConfig } from '../../config/app-config.js';
import { AuthService } from './auth.service.js';
import {
  AcceptInvitationDto,
  ChangePasswordDto,
  EmailDto,
  LoginDto,
  ResetPasswordDto,
  SignupDto,
  TokenDto,
} from './dto/auth.dto.js';
import { clearedSessionCookieOptions, sessionCookieOptions } from './http/cookies.js';
import { CurrentAuth, Public, SensitiveRateLimit } from './http/decorators.js';
import { type AuthContext, requestMeta } from './http/request-context.js';

const CHECK_EMAIL = 'If that address can be used, we have sent an email with next steps.';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @SensitiveRateLimit()
  @Post('signup')
  @HttpCode(HttpStatus.ACCEPTED)
  async signup(@Body() dto: SignupDto, @Req() request: Request): Promise<MessageResponse> {
    await this.auth.signup(dto, requestMeta(request));
    return { message: CHECK_EMAIL };
  }

  @Public()
  @SensitiveRateLimit()
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: TokenDto, @Req() request: Request): Promise<MessageResponse> {
    await this.auth.verifyEmail(dto.token, requestMeta(request));
    return { message: 'Your email address is verified. You can now sign in.' };
  }

  @Public()
  @SensitiveRateLimit()
  @Post('email/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(@Body() dto: EmailDto): Promise<MessageResponse> {
    await this.auth.resendVerification(dto.email);
    return { message: CHECK_EMAIL };
  }

  @Public()
  @SensitiveRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    const { session, me } = await this.auth.login(dto, requestMeta(request));
    response.cookie(
      this.config.auth.sessionCookieName,
      session.token,
      sessionCookieOptions(this.config.auth, session.expiresAt.getTime() - Date.now()),
    );
    return me;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(auth, requestMeta(request));
    response.clearCookie(
      this.config.auth.sessionCookieName,
      clearedSessionCookieOptions(this.config.auth),
    );
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logoutAll(auth, requestMeta(request));
    response.clearCookie(
      this.config.auth.sessionCookieName,
      clearedSessionCookieOptions(this.config.auth),
    );
  }

  @Get('me')
  me(@CurrentAuth() auth: AuthContext): Promise<MeResponse> {
    return this.auth.me(auth.user.id);
  }

  @Public()
  @SensitiveRateLimit()
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() dto: EmailDto, @Req() request: Request): Promise<MessageResponse> {
    await this.auth.forgotPassword(dto.email, requestMeta(request));
    return { message: CHECK_EMAIL };
  }

  @Public()
  @SensitiveRateLimit()
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    await this.auth.resetPassword(dto, requestMeta(request));
    return { message: 'Your password has been changed. Sign in with your new password.' };
  }

  @SensitiveRateLimit()
  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    await this.auth.changePassword(auth, dto, requestMeta(request));
    return { message: 'Your password has been changed. Other devices have been signed out.' };
  }

  @Public()
  @SensitiveRateLimit()
  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    await this.auth.acceptInvitation(dto, requestMeta(request));
    return { message: 'Invitation accepted. Sign in to continue.' };
  }
}
