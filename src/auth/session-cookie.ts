
import { ForbiddenException } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'conecta_refresh';
export const REFRESH_COOKIE_PATH = '/api/auth';
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CSRF_HEADER_NAME = 'x-csrf-protection';
export const CSRF_HEADER_VALUE = '1';

const REFRESH_TOKEN_PATTERN =
  /^[a-f0-9]{24}\.[A-Za-z0-9_-]{64}\.[A-Za-z0-9_-]{64}$/;

function isLocalDevelopmentOrigin(url: URL) {
  return (
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
    url.protocol === 'http:'
  );
}

export function getConfiguredAuthOrigins(): string[] {
  const configured = process.env.AUTH_ALLOWED_ORIGINS;

  if (!configured?.trim()) {
    return [];
  }

  return configured.split(',').map((entry) => {
    const value = entry.trim();

    try {
      const url = new URL(value);
      const isLocalhost = isLocalDevelopmentOrigin(url);

      if (
        !['http:', 'https:'].includes(url.protocol) ||
        (process.env.NODE_ENV === 'production' &&
          url.protocol !== 'https:' &&
          !isLocalhost) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      ) {
        throw new Error();
      }

      return url.origin;
    } catch {
      throw new Error(
        'AUTH_ALLOWED_ORIGINS must contain valid origin URLs',
      );
    }
  });
}

export function assertAuthRequestAllowed(request: Request) {
  const origin = request.get('origin');

  if (!origin || request.get(CSRF_HEADER_NAME) !== CSRF_HEADER_VALUE) {
    throw new ForbiddenException('Origem ou proteção CSRF inválida');
  }

  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new ForbiddenException('Origem inválida');
  }

  if (
    parsedOrigin.origin !== origin ||
    !['http:', 'https:'].includes(parsedOrigin.protocol)
  ) {
    throw new ForbiddenException('Origem inválida');
  }

  const allowedOrigins = getConfiguredAuthOrigins();

  const isAllowed = allowedOrigins.length
    ? allowedOrigins.includes(parsedOrigin.origin)
    : parsedOrigin.host.toLowerCase() ===
        request.get('host')?.toLowerCase() &&
      (process.env.NODE_ENV !== 'production' ||
        parsedOrigin.protocol === 'https:');

  if (!isAllowed) {
    throw new ForbiddenException('Origem não permitida');
  }
}

export function readRefreshToken(request: Request) {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return undefined;
  }

  let token: string | undefined;

  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');

    if (
      separator < 0 ||
      cookie.slice(0, separator).trim() !== REFRESH_COOKIE_NAME
    ) {
      continue;
    }

    if (token !== undefined) {
      return undefined;
    }

    token = cookie.slice(separator + 1).trim();
  }

  return token && REFRESH_TOKEN_PATTERN.test(token)
    ? token
    : undefined;
}

function refreshCookieOptions(): CookieOptions {
  const secure = process.env.NODE_ENV === 'production';
  const sameSite =
    process.env.AUTH_COOKIE_SAME_SITE?.toLowerCase() ?? 'lax';

  if (sameSite !== 'lax' && sameSite !== 'none') {
    throw new Error('AUTH_COOKIE_SAME_SITE must be either lax or none');
  }

  if (sameSite === 'none' && !secure) {
    throw new Error('AUTH_COOKIE_SAME_SITE=none requires production HTTPS');
  }

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(response: Response, refreshToken: string) {
  response.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...refreshCookieOptions(),
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function clearRefreshCookie(response: Response) {
  response.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
}
