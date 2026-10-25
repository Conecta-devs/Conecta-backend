import { Injectable, ServiceUnavailableException } from '@nestjs/common';

type ResendConfiguration = {
  apiKey: string;
  from: string;
  frontendUrl: URL;
};

@Injectable()
export class ResendEmailService {
  assertConfigured() {
    this.getConfiguration();
  }

  async sendPasswordReset(email: string, token: string) {
    const { apiKey, from, frontendUrl } = this.getConfiguration();
    const resetUrl = new URL('/reset-password', frontendUrl);
    resetUrl.searchParams.set('token', token);
    const link = resetUrl.toString();

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Redefinição de senha do Conecta',
        text: `Para redefinir sua senha, acesse: ${link}`,
        html: `<p>Para redefinir sua senha, acesse o link abaixo:</p><p><a href="${link}">Redefinir senha</a></p><p>O link expira em 30 minutos. Se você não solicitou a redefinição, ignore este e-mail.</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error('Email provider rejected the request');
    }
  }

  private getConfiguration(): ResendConfiguration {
    const apiKey = process.env['RESEND_API_KEY']?.trim();
    const from = process.env['RESEND_FROM_EMAIL']?.trim();
    const configuredFrontendUrl = process.env['FRONTEND_URL']?.trim();
    const frontendUrlValue =
      configuredFrontendUrl ||
      (process.env['NODE_ENV'] === 'production'
        ? undefined
        : 'http://localhost:5173');

    if (!apiKey || !from || !frontendUrlValue) {
      throw new ServiceUnavailableException(
        'O serviço de recuperação de senha não está configurado',
      );
    }

    const senderAddress = from.match(/<([^<>]+)>$/)?.[1] ?? from;
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(senderAddress)) {
      throw new ServiceUnavailableException(
        'O serviço de recuperação de senha não está configurado',
      );
    }

    let frontendUrl: URL;
    try {
      frontendUrl = new URL(frontendUrlValue);
    } catch {
      throw new ServiceUnavailableException(
        'O serviço de recuperação de senha não está configurado',
      );
    }

    if (
      !['http:', 'https:'].includes(frontendUrl.protocol) ||
      frontendUrl.username ||
      frontendUrl.password ||
      (process.env['NODE_ENV'] === 'production' &&
        frontendUrl.protocol !== 'https:')
    ) {
      throw new ServiceUnavailableException(
        'O serviço de recuperação de senha não está configurado',
      );
    }

    return { apiKey, from, frontendUrl };
  }
}
