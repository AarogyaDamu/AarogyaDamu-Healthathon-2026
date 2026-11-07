import request from 'supertest';
import { app, prisma } from '../server';

describe('Express Reverse-Proxy & Rate-Limiter Trust Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null as any);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  test('Express application has "trust proxy" strictly set to 1 hop', () => {
    expect(app.get('trust proxy')).toBe(1);
    expect(app.get('trust proxy')).not.toBe(true);
    expect(app.get('trust proxy')).not.toBe(false);
  });

  test('Request with X-Forwarded-For header does not throw ERR_ERL_UNEXPECTED_X_FORWARDED_FOR', async () => {
    const res = await request(app)
      .get('/health')
      .set('X-Forwarded-For', '198.51.100.42');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  test('Resolves correct client IP from X-Forwarded-For and prevents IP spoofing', async () => {
    // When a single proxy is trusted (trust proxy = 1), Express treats the immediate
    // connecting socket as the proxy, and takes the rightmost client IP from X-Forwarded-For.
    // If an attacker attempts to spoof by sending "1.1.1.1, 203.0.113.50", Express with trust proxy = 1
    // resolves req.ip to "203.0.113.50" rather than the forged "1.1.1.1".
    let capturedIp = '';
    app.get('/test-proxy-ip-resolution', (req, res) => {
      capturedIp = req.ip || '';
      res.json({ ip: req.ip });
    });

    const res = await request(app)
      .get('/test-proxy-ip-resolution')
      .set('X-Forwarded-For', '1.1.1.1, 203.0.113.50');

    expect(res.status).toBe(200);
    expect(res.body.ip).toBe('203.0.113.50');
    expect(capturedIp).toBe('203.0.113.50');
  });

  test('Rate-limiting properly throttles repeated requests from the same proxied client IP (429)', async () => {
    const clientIp = '198.51.100.99';
    const email = 'rate-limit-proxy-test@example.com';

    // passwordResetRateLimiter has max: 5 requests per hour
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', clientIp)
        .send({ email });
      // Request is accepted within limit
      expect(res.status).toBe(200);
    }

    // The 6th request from the same client IP must be blocked with HTTP 429
    const blockedRes = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Forwarded-For', clientIp)
      .send({ email });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error).toMatch(/too many password reset requests/i);

    // Another client with a different IP should NOT be blocked
    const differentClientIp = '198.51.100.100';
    const otherClientRes = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Forwarded-For', differentClientIp)
      .send({ email });

    expect(otherClientRes.status).toBe(200);
  });
});
