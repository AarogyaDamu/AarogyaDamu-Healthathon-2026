import { sendPasswordResetEmail, EmailDeliveryError } from '../services/emailService';

describe('Password reset email provider', () => {
  test('sends a reset link with the token in the URL fragment', async () => {
    const fetcher: typeof fetch = async (_input, _init) => new Response('{}', { status: 202 });
    const fetchSpy = jest.fn(fetcher);

    await sendPasswordResetEmail('doctor@example.test', 'opaque-reset-token', fetchSpy);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(String(options?.body));
    const resetLink = body.text.match(/https?:\/\/\S+/)?.[0];
    if (!resetLink) throw new Error('Email body did not include a reset link.');
    expect(new URL(resetLink).hash).toContain('opaque-reset-token');
    expect(body.to).toEqual(['doctor@example.test']);
  });

  test('reports provider rejection without exposing provider response details', async () => {
    const fetcher: typeof fetch = async () => new Response('private provider response', { status: 401 });

    await expect(sendPasswordResetEmail('doctor@example.test', 'opaque-reset-token', fetcher))
      .rejects.toBeInstanceOf(EmailDeliveryError);
  });
});
