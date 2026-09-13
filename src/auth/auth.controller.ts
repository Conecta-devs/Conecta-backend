import { Body, Controller, Post, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth/jwt-auth.guard.js';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { profile } from 'console';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('register')
    async register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('login')
    login(@Body() dto: LoginDto){
        return this.authService.login(dto.email, dto.password);
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    profile(@Req() req: any) {
        return req.user;
  }
}
