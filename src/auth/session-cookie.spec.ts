import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { afterEach, vi } from 'vitest';
import {
  assertAuthRequestAllowed,
  CSRF_HEADER_NAME,
  CSRF_HEADER_VALUE,
  getConfiguredAuthOrigins,
  readRefreshToken,
  REFRESH_COOKIE_NAME,
} from './session-cookie.js';

function makeRequest(
  headers: Record<string, string>,
  cookie?: string,
) {
  return {
    headers: cookie ? { cookie } : {},
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

describe('refresh cookie and CSRF helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a same-origin request with the required CSRF header', () => {
    assertAuthRequestAllowed(
      makeRequest({
        origin: 'http://localhost:5173',
        host: 'localhost:5173',
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      }),
    );
  });

  it('rejects missing origin, missing CSRF header, and cross-origin requests', () => {
    const cases = [
      { host: 'localhost:5173', [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE },
      { origin: 'http://localhost:5173', host: 'localhost:5173' },
      {
        origin: 'https://attacker.example',
        host: 'localhost:5173',
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      },
    ];

    for (const headers of cases) {
      expect(() => assertAuthRequestAllowed(makeRequest(headers))).toThrow(
        ForbiddenException,
      );
    }
  });

  it('requires HTTPS origins in production when no explicit origin list is set', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() =>
      assertAuthRequestAllowed(
        makeRequest({
          origin: 'http://api.example',
          host: 'api.example',
          [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('supports explicitly configured origins without allowing wildcard origins', () => {
    vi.stubEnv('AUTH_ALLOWED_ORIGINS', 'https://frontend.example');

    expect(getConfiguredAuthOrigins()).toEqual(['https://frontend.example']);
    expect(() =>
      assertAuthRequestAllowed(
        makeRequest({
          origin: 'https://attacker.example',
          host: 'api.example',
          [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects insecure explicitly configured origins in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_ALLOWED_ORIGINS', 'http://frontend.example');

    expect(() => getConfiguredAuthOrigins()).toThrow(
      'AUTH_ALLOWED_ORIGINS must contain valid origin URLs',
    );
  });

  it('rejects invalid configured origin values', () => {
    vi.stubEnv('AUTH_ALLOWED_ORIGINS', '*');

    expect(() => getConfiguredAuthOrigins()).toThrow(
      'AUTH_ALLOWED_ORIGINS must contain valid origin URLs',
    );
  });

  it('reads one well-formed opaque refresh token from the cookie header', () => {
    const token = `${'a'.repeat(24)}.${'b'.repeat(64)}.${'c'.repeat(64)}`;
    const req = makeRequest(
      {},
      `other=value; ${REFRESH_COOKIE_NAME}=${token}`,
    );

    expect(readRefreshToken(req)).toBe(token);
  });

  it('rejects malformed or duplicate refresh cookies', () => {
    const firstToken = `${'a'.repeat(24)}.${'b'.repeat(64)}.${'c'.repeat(64)}`;
    const secondToken = `${'d'.repeat(24)}.${'e'.repeat(64)}.${'f'.repeat(64)}`;

    expect(
      readRefreshToken(makeRequest({}, `${REFRESH_COOKIE_NAME}=not-valid`)),
    ).toBeUndefined();
    expect(
      readRefreshToken(
        makeRequest(
          {},
          `${REFRESH_COOKIE_NAME}=${firstToken}; ${REFRESH_COOKIE_NAME}=${secondToken}`,
        ),
      ),
    ).toBeUndefined();
  });
});
