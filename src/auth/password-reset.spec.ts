import { createHash } from 'node:crypto';
import { Logger, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { ResendEmailService } from './resend-email.service.js';

const state = vi.hoisted(() => {
  const user: Record<string, unknown> = {
    _id: '65f1234567890abcdef12345',
    email: 'user@example.com',
    name: 'Test User',
    passwordHash: 'old-password-hash',
    authVersion: 0,
  };
  const users = [user];
  const sessions: Record<string, unknown>[] = [];
  const resetTokens: Record<string, unknown>[] = [];

  const matches = (document: Record<string, unknown>, filters: unknown[]) =>
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
      first: async () => users.find((user) => matches(user, filters)) ?? null,
      update: async (changes: Record<string, unknown>) => {
        const found = users.find((user) => matches(user, filters));
        if (!found) return null;
        Object.assign(found, changes);
        return found;
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
      updateAndCount: async (changes: Record<string, unknown>) => {
        const found = sessions.filter((session) =>
          matches(session, filters),
        );
        found.forEach((session) => Object.assign(session, changes));
        return found.length;
      },
    };
    return chain;
  });

  const resetTokensWhere = vi.fn((filter: unknown) => {
    const filters = [filter];
    const chain = {
      where: (nextFilter: unknown) => {
        filters.push(nextFilter);
        return chain;
      },
      first: async () =>
        resetTokens.find((token) => matches(token, filters)) ?? null,
      upsert: async ({
        create,
        update,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const current = resetTokens.find((token) =>
          matches(token, filters),
        );
        if (current) {
          Object.assign(current, update);
          return current;
        }
        const created = { ...create, _id: 'reset-token-id' };
        resetTokens.push(created);
        return created;
      },
      update: async (changes: Record<string, unknown>) => {
        const current = resetTokens.find((token) =>
          matches(token, filters),
        );
        if (!current) return null;
        Object.assign(current, changes);
        return current;
      },
    };
    return chain;
  });

  return {
    user,
    users,
    sessions,
    resetTokens,
    usersWhere,
    sessionsWhere,
    resetTokensWhere,
    bcryptHash: vi.fn(async () => 'new-password-hash'),
    jwtSign: vi.fn(() => 'access-token'),
  };
});

vi.mock('../prisma/db.js', () => ({
  db: {
    orm: {
      users: { where: state.usersWhere },
      sessions: { where: state.sessionsWhere },
      password_reset_tokens: { where: state.resetTokensWhere },
    },
  },
}));

vi.mock('bcrypt', () => ({
  compare: vi.fn(),
  hash: state.bcryptHash,
}));

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function addResetToken(
  token: string,
  overrides: Record<string, unknown> = {},
) {
  const record = {
    _id: 'reset-token-id',
    userId: state.user._id,
    tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    ...overrides,
  };
  state.resetTokens.push(record);
  return record;
}

describe('AuthService password recovery', () => {
  let service: AuthService;
  const mailer = {
    assertConfigured: vi.fn(),
    sendPasswordReset: vi.fn(),
  };

  beforeEach(() => {
    state.users.splice(0, state.users.length, state.user);
    Object.assign(state.user, {
      email: 'user@example.com',
      passwordHash: 'old-password-hash',
      authVersion: 0,
    });
    state.sessions.splice(0);
    state.resetTokens.splice(0);
    state.usersWhere.mockClear();
    state.sessionsWhere.mockClear();
    state.resetTokensWhere.mockClear();
    state.bcryptHash.mockClear();
    mailer.assertConfigured.mockReset();
    mailer.sendPasswordReset.mockReset();
    mailer.sendPasswordReset.mockResolvedValue(undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    service = new AuthService(
      { sign: state.jwtSign } as unknown as JwtService,
      mailer as unknown as ResendEmailService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores only a hash and sends the reset link for a registered email', async () => {
    const result = await service.requestPasswordReset({
      email: ' USER@EXAMPLE.COM ',
    });
    const [sentEmail, sentToken] = mailer.sendPasswordReset.mock.calls[0];

    expect(result).toEqual({
      message:
        'Se o endereço estiver cadastrado, será possível solicitar a redefinição da senha.',
    });
    expect(mailer.assertConfigured).toHaveBeenCalledOnce();
    expect(sentEmail).toBe('user@example.com');
    expect(sentToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(state.resetTokens[0].tokenHash).toBe(tokenHash(sentToken));
    expect(state.resetTokens[0]).not.toHaveProperty('token');
    expect(JSON.stringify(state.resetTokens)).not.toContain(sentToken);
    expect(state.resetTokens[0].expiresAt).toBeInstanceOf(Date);
  });

  it('returns the same response for an unknown email without sending mail', async () => {
    state.users.splice(0);

    const result = await service.requestPasswordReset({
      email: 'missing@example.com',
    });

    expect(result).toEqual({
      message:
        'Se o endereço estiver cadastrado, será possível solicitar a redefinição da senha.',
    });
    expect(mailer.sendPasswordReset).not.toHaveBeenCalled();
    expect(state.resetTokens).toHaveLength(0);
  });

  it('returns the generic response when Resend delivery fails', async () => {
    mailer.sendPasswordReset.mockRejectedValue(new Error('provider error'));

    await expect(
      service.requestPasswordReset({ email: 'user@example.com' }),
    ).resolves.toEqual({
      message:
        'Se o endereço estiver cadastrado, será possível solicitar a redefinição da senha.',
    });
  });

  it('does not wait for email delivery before returning the generic response', async () => {
    mailer.sendPasswordReset.mockReturnValue(new Promise(() => {}));

    await expect(
      service.requestPasswordReset({ email: 'user@example.com' }),
    ).resolves.toEqual({
      message:
        'Se o endereço estiver cadastrado, será possível solicitar a redefinição da senha.',
    });
  });

  it('replaces an earlier token when another request is made', async () => {
    await service.requestPasswordReset({ email: 'user@example.com' });
    const previousToken = mailer.sendPasswordReset.mock.calls[0][1];
    await service.requestPasswordReset({ email: 'user@example.com' });
    const currentToken = mailer.sendPasswordReset.mock.calls[1][1];

    expect(currentToken).not.toBe(previousToken);
    expect(state.resetTokens).toHaveLength(1);
    expect(state.resetTokens[0].tokenHash).toBe(tokenHash(currentToken));
    expect(state.resetTokens[0].tokenHash).not.toBe(tokenHash(previousToken));
  });

  it('updates the password and revokes sessions when a token is valid', async () => {
    const token = 'a'.repeat(43);
    state.user.authVersion = null;
    addResetToken(token);
    const session = {
      userId: state.user._id,
      revokedAt: null,
    };
    state.sessions.push(session);

    await expect(
      service.resetPassword({ token, password: 'new-password' }),
    ).resolves.toEqual({ message: 'Senha redefinida com sucesso.' });

    expect(state.bcryptHash).toHaveBeenCalledWith('new-password', 10);
    expect(state.user.passwordHash).toBe('new-password-hash');
    expect(state.user.authVersion).toBe(1);
    expect(state.resetTokens[0].consumedAt).toBeInstanceOf(Date);
    expect(session.revokedAt).toBeInstanceOf(Date);
  });

  it.each([
    ['invalid', 'b'.repeat(43), {}],
    [
      'expired',
      'c'.repeat(43),
      { expiresAt: new Date(Date.now() - 1) },
    ],
    ['consumed', 'd'.repeat(43), { consumedAt: new Date() }],
  ])('rejects a %s token', async (_label, token, overrides) => {
    if (_label !== 'invalid') {
      addResetToken(token, overrides);
    }

    await expect(
      service.resetPassword({ token, password: 'new-password' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.bcryptHash).not.toHaveBeenCalled();
  });

  it('rejects malformed tokens without querying the database', async () => {
    await expect(
      service.resetPassword({ token: 'not-a-token', password: 'new-password' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.resetTokensWhere).not.toHaveBeenCalled();
  });

  it('rejects token reuse after a successful reset', async () => {
    const token = 'e'.repeat(43);
    addResetToken(token);
    await service.resetPassword({ token, password: 'new-password' });

    await expect(
      service.resetPassword({ token, password: 'another-password' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows only one winner when two reset attempts race to consume a token', async () => {
    const token = 'f'.repeat(43);
    addResetToken(token);

    const results = await Promise.allSettled([
      service.resetPassword({ token, password: 'password-one' }),
      service.resetPassword({ token, password: 'password-two' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
      1,
    );
  });
});
