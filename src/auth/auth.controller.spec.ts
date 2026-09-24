import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: vi.fn(),
            login: vi.fn(),
            edit: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call authService.edit when update profile route is used', async () => {
    const dto = {
      name: 'Maria',
      bio: 'Dev front-end',
      gen: 'feminino',
      image: 'https://example.com/avatar.png',
      permissao: 'usuario',
    };

    const req = { user: { email: 'maria@email.com' } };

    await controller.edit(req, dto);

    expect(controller['authService'].edit).toHaveBeenCalledWith(req.user.email, dto);
  });
});
