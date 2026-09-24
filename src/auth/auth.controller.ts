import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth/jwt-auth.guard.js';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { EditarDto } from './dto/editar.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  profile(@Req() req: any) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Put('edit')
  @Patch('edit')
  edit(@Req() req: any, @Body() dto: EditarDto) {
    return this.authService.edit(req.user.email, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('validate')
  validate(@Req() req: any) {
    return {
      valid: true,
      user: req.user,
    };
  }
}
