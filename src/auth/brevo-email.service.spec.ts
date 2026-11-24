import { ServiceUnavailableException } from '@nestjs/common';
import { vi } from 'vitest';
import { BrevoEmailService } from './brevo-email.service.js';

describe('BrevoEmailService', () => {
  let service: BrevoEmailService;

  beforeEach(() => {
    vi.stubEnv('BREVO_API_KEY', 'test-api-key');
    vi.stubEnv('BREVO_FROM_EMAIL', 'Conecta <mike.ensergueix@gmail.com>');
    vi.stubEnv('FRONTEND_URL', 'http://localhost:5173');
    vi.stubEnv('NODE_ENV', 'development');
    service = new BrevoEmailService();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('envia o link pela API do Brevo com remetente e frontend configurados', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await service.sendPasswordReset('user@example.com', 'a'.repeat(43));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(options.headers).toEqual(
      expect.objectContaining({
        'api-key': 'test-api-key',
        'Content-Type': 'application/json',
      }),
    );
    const body = JSON.parse(options.body);
    expect(body.sender).toEqual({
      name: 'Conecta',
      email: 'mike.ensergueix@gmail.com',
    });
    expect(body.to).toEqual([{ email: 'user@example.com' }]);
    expect(body.subject).toBe('Redefinição de senha do Conecta');
    expect(body.textContent).toContain(
      'http://localhost:5173/reset-password?token=' + 'a'.repeat(43),
    );
    expect(body.htmlContent).toContain('Redefinir senha');
  });

  it('rejeita configuração ausente antes de chamar a API', async () => {
    vi.stubEnv('BREVO_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(() => service.assertConfigured()).toThrow(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exige HTTPS no frontend em produção', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => service.assertConfigured()).toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejeita remetente malformado', () => {
    vi.stubEnv('BREVO_FROM_EMAIL', 'not-an-email');

    expect(() => service.assertConfigured()).toThrow(
      ServiceUnavailableException,
    );
  });

  it('não trata erro do provedor como sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(
      service.sendPasswordReset('user@example.com', 'b'.repeat(43)),
    ).rejects.toThrow('Email provider rejected the request');
  });
});
