import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from './jwt-auth/jwt-auth.guard.js';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';

import { getConfiguredAuthOrigins } from './session-cookie.js';

import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { EditarDto } from './dto/editar.dto.js';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  assertAuthRequestAllowed,
  clearRefreshCookie,
  readRefreshToken,
  setRefreshCookie,
} from './session-cookie.js';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    name: string;
  };
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertAuthRequestAllowed(request);
    const result = await this.authService.login(dto.email, dto.password);
    setRefreshCookie(response, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertAuthRequestAllowed(request);
    const refreshToken = readRefreshToken(request);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token ausente ou inválido');
    }

    const result = await this.authService.refresh(refreshToken);
    setRefreshCookie(response, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertAuthRequestAllowed(request);
    await this.authService.logout(readRefreshToken(request));
    clearRefreshCookie(response);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  profile(@Req() req: AuthenticatedRequest) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Put('edit')
  @Patch('edit')
  edit(@Req() req: AuthenticatedRequest, @Body() dto: EditarDto) {
    return this.authService.edit(req.user.email, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('validate')
  validate(@Req() req: AuthenticatedRequest) {
    return {
      valid: true,
      user: req.user,
    };
  }
}
