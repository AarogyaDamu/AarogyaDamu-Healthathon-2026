import { env } from '../config/env';

export class EmailDeliveryError extends Error {
  constructor() {
    super('Password reset email could not be delivered.');
    this.name = 'EmailDeliveryError';
  }
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  fetcher?: typeof fetch
): Promise<void> {
  if ((!fetcher && env.EMAIL_PROVIDER !== 'resend') || !env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new EmailDeliveryError();
  }

  const resetUrl = new URL('/login', env.WEB_APP_URL);
  resetUrl.hash = new URLSearchParams({ resetToken: token }).toString();

  let response: Response;
  try {
    response = await (fetcher ?? fetch)('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [email],
        subject: 'Reset your AarogyaDamu Doctor password',
        text: `Use this one-time link to reset your password. It expires in one hour:\n\n${resetUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
      }),
    });
  } catch {
    throw new EmailDeliveryError();
  }

  if (!response.ok) throw new EmailDeliveryError();
}
