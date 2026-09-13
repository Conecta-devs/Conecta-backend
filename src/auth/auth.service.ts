import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { db } from '../prisma/db.js';
import { RegisterDto } from './dto/register.dto.js';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService){}

  async register(dto: RegisterDto) {
  const existingUser = await db.orm.users
    .where({
      email: dto.email,
    })
    .first();

  if (existingUser) {
    throw new ConflictException('Email já cadastrado');
  }

  const passwordHash = await bcrypt.hash(dto.password, 10);

  const user = await db.orm.users.create({
    email: dto.email,
    name: dto.name,
    passwordHash,
  });

  return {
    email: user.email,
    name: user.name,
  };
}

  async login(email: string, password: string) {
  const user = await db.orm.users
    .where({
      email,
    })
    .first();

  if (!user) {
    throw new UnauthorizedException('Email ou senha inválidos');
  }

  const passwordMatches = await bcrypt.compare(
    password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw new UnauthorizedException('Email ou senha inválidos');
  }

  const accessToken = this.jwtService.sign({
  email: user.email,
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