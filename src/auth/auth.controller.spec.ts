import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import {
  clearRefreshCookie,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  setRefreshCookie,
} from './session-cookie.js';

const REFRESH_TOKEN = `${'a'.repeat(24)}.${'r'.repeat(64)}.${'s'.repeat(64)}`;
const NEXT_REFRESH_TOKEN = `${'b'.repeat(24)}.${'n'.repeat(64)}.${'t'.repeat(64)}`;
const REQUEST_HEADERS: Record<string, string> = {
  origin: 'http://localhost:5173',
  host: 'localhost:5173',
  'x-csrf-protection': '1',
};

function request(headers: Record<string, string> = REQUEST_HEADERS) {
  return {
    headers: {},
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function response() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response;
}

describe('AuthController refresh token endpoints', () => {
  const authService = {
    register: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    edit: vi.fn(),
  };
  let controller: AuthController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AuthController(authService as unknown as AuthService);
  });

  it('keeps refresh tokens out of the login JSON and sets them as cookies', async () => {
    authService.login.mockResolvedValue({
      accessToken: 'access',
      refreshToken: REFRESH_TOKEN,
      user: { email: 'user@example.com', name: 'Test User' },
    });

    const res = response();

    const result = await controller.login(
      { email: 'user@example.com', password: 'password123' },
      request(),
      res,
    );

    expect(result).toEqual({
      accessToken: 'access',
      user: { email: 'user@example.com', name: 'Test User' },
    });
    expect(JSON.stringify(result)).not.toContain(REFRESH_TOKEN);
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      REFRESH_TOKEN,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: REFRESH_COOKIE_PATH,
      }),
    );
  });

  it('delegates forgot-password requests to the service', async () => {
    const dto = { email: 'user@example.com' };
    authService.requestPasswordReset.mockResolvedValue({ message: 'generic' });

    await expect(controller.forgotPassword(dto)).resolves.toEqual({
      message: 'generic',
    });
    expect(authService.requestPasswordReset).toHaveBeenCalledWith(dto);
  });

  it('delegates reset-password requests to the service', async () => {
    const dto = { token: 'a'.repeat(43), password: 'new-password' };
    authService.resetPassword.mockResolvedValue({ message: 'reset' });

    await expect(controller.resetPassword(dto)).resolves.toEqual({
      message: 'reset',
    });
    expect(authService.resetPassword).toHaveBeenCalledWith(dto);
  });

  it('reads the refresh token from the cookie and sets the rotated cookie', async () => {
    authService.refresh.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: NEXT_REFRESH_TOKEN,
      user: { email: 'user@example.com', name: 'Test User' },
    });
    const req = request();
    req.headers.cookie = `${REFRESH_COOKIE_NAME}=${REFRESH_TOKEN}`;
    const res = response();

    const result = await controller.refresh(req, res);

    expect(authService.refresh).toHaveBeenCalledWith(REFRESH_TOKEN);
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      NEXT_REFRESH_TOKEN,
      expect.any(Object),
    );
    expect(JSON.stringify(result)).not.toContain(NEXT_REFRESH_TOKEN);
  });

  it('rejects refresh requests without a valid cookie', async () => {
    await expect(controller.refresh(request(), response())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it('revokes the cookie session and clears the cookie on logout', async () => {
    const req = request();
    req.headers.cookie = `${REFRESH_COOKIE_NAME}=${REFRESH_TOKEN}`;
    const res = response();

    await controller.logout(req, res);

    expect(authService.logout).toHaveBeenCalledWith(REFRESH_TOKEN);
    expect(res.clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      expect.objectContaining({
        path: REFRESH_COOKIE_PATH,
        httpOnly: true,
        sameSite: 'lax',
      }),
    );
  });

  it('preserves the existing edit-profile behavior', async () => {
    const dto = {
      name: 'Maria',
      bio: 'Dev front-end',
      gen: 'feminino',
      image: 'https://example.com/avatar.png',
      permissao: 'usuario',
    };
    const req = { user: { sub: 'user-id', email: 'maria@email.com', name: 'Maria' } };

    await controller.edit(req, dto);

    expect(authService.edit).toHaveBeenCalledWith(req.user.email, dto);
  });

  it('preserves the existing profile response', () => {
    const req = {
      user: {
        sub: '65f1234567890abcdef12345',
        email: 'maria@email.com',
        name: 'Maria',
      },
    };

    expect(controller.profile(req)).toBe(req.user);
  });

  it('uses Secure cookies in production and clears with the same path', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = response();

    setRefreshCookie(res, REFRESH_TOKEN);
    clearRefreshCookie(res);

    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      REFRESH_TOKEN,
      expect.objectContaining({ secure: true, path: REFRESH_COOKIE_PATH }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      expect.objectContaining({ secure: true, path: REFRESH_COOKIE_PATH }),
    );
  });

  it('allows SameSite=None only with Secure cookies for cross-site deployments', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_COOKIE_SAME_SITE', 'none');
    const res = response();

    setRefreshCookie(res, REFRESH_TOKEN);

    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      REFRESH_TOKEN,
      expect.objectContaining({ secure: true, sameSite: 'none' }),
    );
  });
});
