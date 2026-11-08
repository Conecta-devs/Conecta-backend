import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { MongoFieldFilter } from '@prisma/orm-mongo/query-ast/execution';
import { db } from '../prisma/db.js';
import { RegisterDto } from './dto/register.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { EditarDto } from './dto/editar.dto.js';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ResendEmailService } from './resend-email.service.js';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_PATTERN =
  /^([a-f0-9]{24})\.([A-Za-z0-9_-]{64})\.([A-Za-z0-9_-]{64})$/;
const PASSWORD_RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_RESPONSE = {
  message:
    'Se o endereço estiver cadastrado, será possível solicitar a redefinição da senha.',
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly resendEmailService: ResendEmailService,
  ) {}

  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await db.orm.users
      .where({
        email: normalizedEmail,
      })
      .first();

    if (existingUser) {
      throw new ConflictException('Email já cadastrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      const user = await db.orm.users.create({
        email: normalizedEmail,
        name: dto.name,
        passwordHash,
        authVersion: 0,
        bio: undefined as any,
        gen: undefined as any,
        image: undefined as any,
        permissao: undefined as any,
      });

      return {
        email: user.email,
        name: user.name,
      };
    } catch (error: any) {
      if (error && error.code === 11000) {
        throw new ConflictException('Email já cadastrado');
      }

      throw error;
    }
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await db.orm.users
      .where({
        email: normalizedEmail,
      })
      .first();

    if (!user) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const sessionSecret = randomBytes(48).toString('base64url');
    const sessionId = this.sessionIdFor(sessionSecret);
    const refreshToken = this.generateRefreshToken(sessionSecret);
    await db.orm.sessions.create({
      _id: sessionId,
      userId: user._id,
      tokenHash: this.hashRefreshToken(refreshToken),
      expiresAt: this.refreshTokenExpiry(),
      revokedAt: null,
      authVersion: user.authVersion ?? 0,
    });

    return {
      accessToken: this.createAccessToken(user),
      refreshToken,
      user: {
        sub: user._id,
        email: user.email,
        name: user.name,
      },
    };
  }

  async refresh(refreshToken: string) {
    const tokenParts = this.parseRefreshToken(refreshToken);
    if (!tokenParts) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const currentHash = this.hashRefreshToken(refreshToken);
    const session = await db.orm.sessions
      .where({
        _id: tokenParts.sessionId,
        tokenHash: currentHash,
      })
      .first();

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const user = await db.orm.users
      .where({
        _id: session.userId,
      })
      .first();

    if (!user) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    if ((session.authVersion ?? 0) !== (user.authVersion ?? 0)) {
      throw new UnauthorizedException('Refresh token invalidado');
    }

    const nextRefreshToken = this.generateRefreshToken(
      tokenParts.sessionSecret,
    );
    const nextHash = this.hashRefreshToken(nextRefreshToken);
    const nextExpiresAt = this.refreshTokenExpiry();

    const rotatedSession = await db.orm.sessions
      .where({
        _id: tokenParts.sessionId,
        tokenHash: currentHash,
      })
      .where(MongoFieldFilter.isNull('revokedAt'))
      .where(MongoFieldFilter.gt('expiresAt', new Date()))
      .update({
        tokenHash: nextHash,
        expiresAt: nextExpiresAt,
      });

    if (!rotatedSession) {
      throw new UnauthorizedException('Refresh token já utilizado');
    }

    return {
      accessToken: this.createAccessToken(user),
      refreshToken: nextRefreshToken,
      user: {
        email: user.email,
        name: user.name,
      },
    };
  }

  async logout(refreshToken?: string) {
    const tokenParts = refreshToken
      ? this.parseRefreshToken(refreshToken)
      : null;
    if (!tokenParts) {
      return;
    }

    await db.orm.sessions
      .where({
        _id: tokenParts.sessionId,
      })
      .where(MongoFieldFilter.isNull('revokedAt'))
      .update({
        revokedAt: new Date(),
      });
  }

  async requestPasswordReset(dto: ForgotPasswordDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await db.orm.users
      .where({
        email: normalizedEmail,
      })
      .first();

    if (!user) {
      return PASSWORD_RESET_RESPONSE;
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashPasswordResetToken(token);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    const resetTokenData = {
      tokenHash,
      expiresAt,
      consumedAt: null,
    };
    try {
      await db.orm.password_reset_tokens.where({ userId: user._id }).upsert({
        create: {
          userId: user._id,
          ...resetTokenData,
        },
        update: resetTokenData,
      });
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 11000
      ) {
        throw error;
      }

      const updatedToken = await db.orm.password_reset_tokens
        .where({ userId: user._id })
        .update(resetTokenData);
      if (!updatedToken) {
        throw error;
      }
    }

    try {
      this.resendEmailService.assertConfigured();
      void this.resendEmailService
        .sendPasswordReset(normalizedEmail, token)
        .catch(() => this.logger.warn('Password reset email delivery failed'));
    } catch {
      this.logger.warn(
        'Password reset email service is not configured; request still accepted',
      );
    }

    return PASSWORD_RESET_RESPONSE;
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (!PASSWORD_RESET_TOKEN_PATTERN.test(dto.token)) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    const tokenHash = this.hashPasswordResetToken(dto.token);
    const resetToken = await db.orm.password_reset_tokens
      .where({ tokenHash })
      .first();
    const now = new Date();

    if (
      !resetToken ||
      resetToken.consumedAt !== null ||
      resetToken.expiresAt.getTime() <= now.getTime()
    ) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const consumedToken = await db.orm.password_reset_tokens
      .where({
        userId: resetToken.userId,
        tokenHash,
      })
      .where(MongoFieldFilter.isNull('consumedAt'))
      .where(MongoFieldFilter.gt('expiresAt', now))
      .update({
        consumedAt: now,
      });

    if (!consumedToken) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    let updatedUser = null;
    for (let attempt = 0; attempt < 5 && !updatedUser; attempt += 1) {
      const user = await db.orm.users
        .where({ _id: resetToken.userId })
        .first();
      if (!user) {
        throw new ServiceUnavailableException(
          'Não foi possível redefinir a senha',
        );
      }

      const userUpdateQuery = db.orm.users.where({ _id: resetToken.userId });
      const versionUpdateQuery =
        user.authVersion === null || user.authVersion === undefined
          ? userUpdateQuery.where(MongoFieldFilter.isNull('authVersion'))
          : userUpdateQuery.where({ authVersion: user.authVersion });
      updatedUser = await versionUpdateQuery.update({
        passwordHash,
        authVersion: (user.authVersion ?? 0) + 1,
      });
    }

    if (!updatedUser) {
      throw new ServiceUnavailableException(
        'Não foi possível redefinir a senha',
      );
    }

    await db.orm.sessions
      .where({ userId: resetToken.userId })
      .where(MongoFieldFilter.isNull('revokedAt'))
      .updateAndCount({ revokedAt: now });

    return { message: 'Senha redefinida com sucesso.' };
  }

  async edit(email: string, dto: EditarDto) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await db.orm.users
      .where({
        email: normalizedEmail,
      })
      .first();

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const updatePayload = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.bio !== undefined ? { bio: dto.bio.trim() } : {}),
      ...(dto.gen !== undefined ? { gen: dto.gen } : {}),
      ...(dto.image !== undefined ? { image: dto.image } : {}),
      ...(dto.permissao !== undefined ? { permissao: dto.permissao } : {}),
    } as any;

    const updatedUser = await db.orm.users
      .where({
        email: normalizedEmail,
      })
      .update(updatePayload);

    if (!updatedUser) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return {
      email: updatedUser.email,
      name: updatedUser.name,
      bio: updatedUser.bio,
      gen: updatedUser.gen,
      image: updatedUser.image,
      permissao: updatedUser.permissao,
    };
  }

  private createAccessToken(user: { _id: string; email: string; name: string }) {
    return this.jwtService.sign({
      sub: user._id,
      email: user.email,
      name: user.name,
    });
  }

  private generateRefreshToken(sessionSecret: string) {
    const sessionId = this.sessionIdFor(sessionSecret);
    const tokenSecret = randomBytes(48).toString('base64url');
    return `${sessionId}.${sessionSecret}.${tokenSecret}`;
  }

  private parseRefreshToken(refreshToken: string) {
    const match = REFRESH_TOKEN_PATTERN.exec(refreshToken);
    if (!match) {
      return null;
    }

    const [, sessionId, sessionSecret] = match;
    if (this.sessionIdFor(sessionSecret) !== sessionId) {
      return null;
    }

    return { sessionId, sessionSecret };
  }

  private sessionIdFor(sessionSecret: string) {
    return createHash('sha256').update(sessionSecret).digest('hex').slice(0, 24);
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private hashPasswordResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTokenExpiry() {
    return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  }
}
