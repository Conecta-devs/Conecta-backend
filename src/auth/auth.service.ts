import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { db } from '../prisma/db.js';
import { RegisterDto } from './dto/register.dto.js';
import { EditarDto } from './dto/editar.dto.js';
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
}