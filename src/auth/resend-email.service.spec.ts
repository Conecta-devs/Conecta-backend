import { ServiceUnavailableException } from '@nestjs/common';
import { vi } from 'vitest';
import { ResendEmailService } from './resend-email.service.js';

describe('ResendEmailService', () => {
  let service: ResendEmailService;

  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 'test-api-key');
    vi.stubEnv('RESEND_FROM_EMAIL', 'Conecta <noreply@example.com>');
    vi.stubEnv('FRONTEND_URL', 'http://localhost:5173');
    vi.stubEnv('NODE_ENV', 'development');
    service = new ResendEmailService();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends a reset link through the Resend API using configured sender and frontend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await service.sendPasswordReset('user@example.com', 'a'.repeat(43));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
      }),
    );
    const body = JSON.parse(options.body);
    expect(body.to).toEqual(['user@example.com']);
    expect(body.from).toBe('Conecta <noreply@example.com>');
    expect(body.text).toContain(
      'http://localhost:5173/reset-password?token=' + 'a'.repeat(43),
    );
  });

  it('rejects missing Resend settings before making a request', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(() => service.assertConfigured()).toThrow(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires an HTTPS frontend URL in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => service.assertConfigured()).toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejects a malformed sender before sending', () => {
    vi.stubEnv('RESEND_FROM_EMAIL', 'not-an-email');

    expect(() => service.assertConfigured()).toThrow(
      ServiceUnavailableException,
    );
  });

  it('does not treat a provider error response as success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(
      service.sendPasswordReset('user@example.com', 'b'.repeat(43)),
    ).rejects.toThrow('Email provider rejected the request');
  });
});
