import { Injectable, ServiceUnavailableException } from '@nestjs/common';

type BrevoConfiguration = {
  apiKey: string;
  senderName: string;
  senderEmail: string;
  frontendUrl: URL;
};

@Injectable()
export class BrevoEmailService {
  assertConfigured(): void {
    this.getConfiguration();
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const { apiKey, senderName, senderEmail, frontendUrl } =
      this.getConfiguration();
    const resetUrl = new URL('/reset-password', frontendUrl);
    resetUrl.searchParams.set('token', token);
    const link = resetUrl.toString();

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email }],
        subject: 'Redefinição de senha do Conecta',
        textContent: `Para redefinir sua senha, acesse: ${link}`,
        htmlContent: `<p>Para redefinir sua senha, acesse o link abaixo:</p><p><a href="${link}">Redefinir senha</a></p><p>O link expira em 30 minutos. Se você não solicitou a redefinição, ignore este e-mail.</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error('Email provider rejected the request');
    }
  }

  private getConfiguration(): BrevoConfiguration {
    const apiKey = process.env['BREVO_API_KEY']?.trim();
    const from = process.env['BREVO_FROM_EMAIL']?.trim();
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

    const senderEmail = from.match(/<([^<>]+)>$/)?.[1] ?? from;
    const senderName = from.includes('<')
      ? from.slice(0, from.indexOf('<')).trim() || 'Conecta'
      : 'Conecta';
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(senderEmail)) {
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

    return { apiKey, senderName, senderEmail, frontendUrl };
  }
}
