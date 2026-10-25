import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { ResendEmailService } from './resend-email.service.js';

const state = vi.hoisted(() => {
  const store: {
    user: Record<string, unknown>;
    sessions: Record<string, unknown>[];
  } = {
    user: {
      _id: '65f1234567890abcdef12345',
      email: 'user@example.com',
      name: 'Test User',
      passwordHash: 'password-hash',
      authVersion: 0,
    },
    sessions: [],
  };

  const matches = (
    document: Record<string, unknown>,
    filters: unknown[],
  ) =>
    filters.every((filter) => {
      if (
        typeof filter === 'object' &&
        filter !== null &&
        'kind' in filter &&
        filter.kind === 'field' &&
        'field' in filter &&
        'op' in filter &&
        'value' in filter
      ) {
        const field = filter.field as string;
        const value = filter.value;
        if (filter.op === '$eq') {
          if (value === null) {
            return document[field] == null;
          }
          return document[field] === value;
        }
        if (filter.op === '$gt') {
          return (
            (document[field] as Date).getTime() > (value as Date).getTime()
          );
        }
        return false;
      }

      return (
        typeof filter === 'object' &&
        filter !== null &&
        Object.entries(filter).every(
          ([key, value]) => document[key] === value,
        )
      );
    });

  const usersWhere = vi.fn((filter: Record<string, unknown>) => {
    const filters: unknown[] = [filter];
    const chain = {
      where: (nextFilter: unknown) => {
        filters.push(nextFilter);
        return chain;
      },
      first: async () =>
        matches(store.user, filters) ? store.user : null,
      update: async (changes: Record<string, unknown>) => {
        if (!matches(store.user, filters)) {
          return null;
        }
        Object.assign(store.user, changes);
        return store.user;
      },
    };
    return chain;
  });

  const sessionsWhere = vi.fn((filter: unknown) => {
    const filters = [filter];
    const chain = {
      where: (nextFilter: unknown) => {
        filters.push(nextFilter);
        return chain;
      },
      first: async () =>
        store.sessions.find((session) => matches(session, filters)) ?? null,
      update: async (changes: Record<string, unknown>) => {
        const session = store.sessions.find((entry) =>
          matches(entry, filters),
        );
        if (!session) {
          return null;
        }

        Object.assign(session, changes);
        return session;
      },
    };
    return chain;
  });

  const sessionsCreate = vi.fn(async (data: Record<string, unknown>) => {
    const session = { ...data, _id: data._id ?? 'session-id' };
    store.sessions.push(session);
    return session;
  });

  return {
    ...store,
    usersWhere,
    sessionsWhere,
    sessionsCreate,
    bcryptCompare: vi.fn(async () => true),
    jwtSign: vi.fn(() => 'signed-access-token'),
  };
});

function createRefreshToken(sessionSecret = 'b'.repeat(64), tokenSecret = 'c'.repeat(64)) {
  const sessionId = createHash('sha256')
    .update(sessionSecret)
    .digest('hex')
    .slice(0, 24);
  return `${sessionId}.${sessionSecret}.${tokenSecret}`;
}

vi.mock('../prisma/db.js', () => ({
  db: {
    orm: {
      users: {
        where: state.usersWhere,
      },
      sessions: {
        where: state.sessionsWhere,
        create: state.sessionsCreate,
      },
    },
  },
}));

vi.mock('bcrypt', () => ({
  compare: state.bcryptCompare,
  hash: vi.fn(async () => 'password-hash'),
}));

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function addSession(overrides: Record<string, unknown> = {}) {
  const sessionSecret = 'b'.repeat(64);
  const refreshToken = createRefreshToken(sessionSecret);
  const sessionId = refreshToken.split('.')[0];
  const session = {
    _id: sessionId,
    userId: state.user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    authVersion: Number(state.user.authVersion ?? 0),
    ...overrides,
  };
  state.sessions.push(session);
  return { refreshToken, session };
}

describe('AuthService refresh token lifecycle', () => {
  let service: AuthService;

  beforeEach(() => {
    state.sessions.splice(0);
    state.user.authVersion = 0;
    state.usersWhere.mockClear();
    state.sessionsWhere.mockClear();
    state.sessionsCreate.mockClear();
    state.bcryptCompare.mockClear();
    state.jwtSign.mockClear();
    service = new AuthService({
      sign: state.jwtSign,
    } as unknown as JwtService, {
      assertConfigured: vi.fn(),
      sendPasswordReset: vi.fn(),
    } as unknown as ResendEmailService);
  });

  it('creates a session with only the SHA-256 hash at login', async () => {
    const startedAt = Date.now();
    const result = await service.login('user@example.com', 'password123');
    const session = state.sessions[0];

    expect(result.refreshToken).toMatch(
      /^[a-f0-9]{24}\.[A-Za-z0-9_-]{64}\.[A-Za-z0-9_-]{64}$/,
    );
    expect(result.accessToken).toBe('signed-access-token');
    expect(session.tokenHash).toBe(hashToken(result.refreshToken));
    expect(session._id).toBe(result.refreshToken.split('.')[0]);
    expect(session).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(session)).not.toContain(result.refreshToken);
    expect(session.revokedAt).toBeNull();
    expect(session.authVersion).toBe(0);
    expect((session.expiresAt as Date).getTime()).toBeGreaterThanOrEqual(
      startedAt + 7 * 24 * 60 * 60 * 1000,
    );
    expect(state.jwtSign).toHaveBeenCalledWith({
      sub: state.user._id,
      email: state.user.email,
      name: state.user.name,
    });
  });

  it('rotates a valid refresh token and issues a new access token', async () => {
    const { refreshToken, session } = addSession();

    const result = await service.refresh(refreshToken);

    expect(result.refreshToken).not.toBe(refreshToken);
    expect(session.tokenHash).toBe(hashToken(result.refreshToken));
    expect(result.accessToken).toBe('signed-access-token');
    expect(state.jwtSign).toHaveBeenCalledWith({
      sub: state.user._id,
      email: state.user.email,
      name: state.user.name,
    });
  });

  it('rejects an unknown refresh token', async () => {
    await expect(
      service.refresh(createRefreshToken('d'.repeat(64))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a refresh session created before a password reset', async () => {
    state.user.authVersion = 1;
    const { refreshToken } = addSession({ authVersion: 0 });

    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    ['expired', { expiresAt: new Date(Date.now() - 1) }],
    ['revoked', { revokedAt: new Date() }],
  ])('rejects a %s refresh token', async (_label, overrides) => {
    const { refreshToken } = addSession(overrides);

    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects malformed refresh tokens before querying sessions', async () => {
    await expect(service.refresh('not-a-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(state.sessionsWhere).not.toHaveBeenCalled();
  });

  it('rejects refresh tokens with an invalid session binding before querying sessions', async () => {
    const token = createRefreshToken().replace(/^[a-f0-9]{24}/, 'd'.repeat(24));

    await expect(service.refresh(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(state.sessionsWhere).not.toHaveBeenCalled();
  });

  it('does not allow the previous token to be reused after rotation', async () => {
    const { refreshToken } = addSession();
    await service.refresh(refreshToken);

    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('allows at most one winner when two refreshes race in the compare-and-set', async () => {
    const { refreshToken, session } = addSession();

    const outcomes = await Promise.allSettled([
      service.refresh(refreshToken),
      service.refresh(refreshToken),
    ]);

    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(
      1,
    );
    expect(session.tokenHash).not.toBe(hashToken(refreshToken));
  });

  it('revokes a known session on logout and remains idempotent', async () => {
    const { refreshToken, session } = addSession();

    await expect(service.logout(refreshToken)).resolves.toBeUndefined();
    expect(session.revokedAt).toBeInstanceOf(Date);
    await expect(service.logout(refreshToken)).resolves.toBeUndefined();
  });

  it('revokes a session when logout races after refresh has rotated its hash', async () => {
    const { refreshToken, session } = addSession();
    const rotated = await service.refresh(refreshToken);
    expect(session.tokenHash).toBe(hashToken(rotated.refreshToken));

    await service.logout(refreshToken);

    expect(session.revokedAt).toBeInstanceOf(Date);
  });

  it('treats missing and malformed logout tokens as idempotent', async () => {
    await expect(service.logout()).resolves.toBeUndefined();
    await expect(service.logout('invalid')).resolves.toBeUndefined();
    expect(state.sessionsWhere).not.toHaveBeenCalled();
  });
});
