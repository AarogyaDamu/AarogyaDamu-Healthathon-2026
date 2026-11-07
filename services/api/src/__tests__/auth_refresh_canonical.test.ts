import request from 'supertest';
import * as authSessions from '../services/authSessions';
import { app, prisma, REFRESH_COOKIE_NAME, CSRF_COOKIE_NAME, parseCookies } from '../server';

jest.mock('../services/authSessions', () => {
  const actual = jest.requireActual('../services/authSessions');
  return {
    ...actual,
    rotateRefreshToken: jest.fn(),
  };
});

describe('Canonical Authentication Refresh Endpoint: /api/auth/refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(prisma.securityAuditEvent, 'create').mockResolvedValue({} as any);
  });

  describe('Route Registration & Mounting', () => {
    test('canonical endpoint POST /api/auth/refresh is mounted and responds to POST requests', async () => {
      const res = await request(app).post('/api/auth/refresh').send({});
      // Must not be 404 Not Found
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(401);
    });

    test('non-canonical endpoint POST /auth/refresh returns 404 Not Found', async () => {
      const res = await request(app).post('/auth/refresh').send({});
      expect(res.status).toBe(404);
    });

    test('GET /api/auth/refresh is not registered and returns 404 Not Found', async () => {
      const res = await request(app).get('/api/auth/refresh');
      expect(res.status).toBe(404);
    });
  });

  describe('Missing Refresh Token', () => {
    test('missing refresh token returns 401 with informative error, not 404', async () => {
      const res = await request(app).post('/api/auth/refresh').send({});
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/valid refresh token is required/i);
    });

    test('empty string refresh token returns 401, not 404', async () => {
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: '' });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/valid refresh token is required/i);
    });
  });

  describe('Expired or Invalid Refresh Token', () => {
    test('invalid or expired refresh token returns 401 and clears auth cookies', async () => {
      (authSessions.rotateRefreshToken as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'expired-or-invalid-token' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid, expired, or revoked/i);

      // Verify server clears the auth cookie
      const setCookies = res.headers['set-cookie'];
      const cookieStr = Array.isArray(setCookies) ? setCookies.join('; ') : String(setCookies || '');
      expect(cookieStr).toMatch(/aarogyadamu_refresh_token=;/i);
    });
  });

  describe('Valid Refresh Token Rotation & Cookie Handling', () => {
    test('body-based valid refresh token rotates session, persists new token, and returns 200', async () => {
      (authSessions.rotateRefreshToken as jest.Mock).mockResolvedValueOnce({
        token: 'new-valid-jwt-access-token',
        refreshToken: 'new-rotated-refresh-token',
      });

      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'valid-incoming-refresh-token' });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.token).toBe('new-valid-jwt-access-token');
      expect(refreshRes.body.refreshToken).toBe('new-rotated-refresh-token');
      expect(refreshRes.body.csrfToken).toBeDefined();

      // Verify Set-Cookie header is returned with updated refresh cookie
      const rotatedCookies = refreshRes.headers['set-cookie'] || [];
      const rotatedCookieStr = Array.isArray(rotatedCookies) ? rotatedCookies.join('; ') : String(rotatedCookies);
      expect(rotatedCookieStr).toContain(REFRESH_COOKIE_NAME);
      expect(rotatedCookieStr).toContain('new-rotated-refresh-token');
    });

    test('cookie-based valid refresh token with CSRF token succeeds and sets secure cookie', async () => {
      (authSessions.rotateRefreshToken as jest.Mock).mockResolvedValueOnce({
        token: 'new-valid-jwt-access-token',
        refreshToken: 'new-rotated-refresh-token',
      });

      const csrfToken = 'test-valid-csrf-token';
      const cookieHeader = `${REFRESH_COOKIE_NAME}=valid-cookie-refresh-token; ${CSRF_COOKIE_NAME}=${csrfToken}`;

      // Cookie refresh WITH matching CSRF header succeeds
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .send({});

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.token).toBe('new-valid-jwt-access-token');
      expect(refreshRes.body.csrfToken).toBeDefined();

      expect(authSessions.rotateRefreshToken).toHaveBeenCalledWith(
        expect.anything(),
        'valid-cookie-refresh-token'
      );
    });

    test('cookie-based refresh without CSRF token is rejected with 403', async () => {
      const cookieHeader = `${REFRESH_COOKIE_NAME}=valid-cookie-refresh-token; ${CSRF_COOKIE_NAME}=test-csrf`;

      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookieHeader)
        .send({});

      expect(refreshRes.status).toBe(403);
      expect(refreshRes.body.error).toMatch(/CSRF validation failed/i);
      expect(authSessions.rotateRefreshToken).not.toHaveBeenCalled();
    });
  });
});
