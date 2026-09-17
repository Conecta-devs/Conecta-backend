import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { db } from '../prisma/db.js';
import { RegisterDto } from './dto/register.dto.js';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

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

    const accessToken = this.jwtService.sign({
      email: user.email,
      name: user.name,
    });

    return {
      accessToken,
      user: {
        email: user.email,
        name: user.name,
      },
    };
  }
}