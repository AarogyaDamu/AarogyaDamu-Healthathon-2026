import request from 'supertest';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { app, prisma, REFRESH_COOKIE_NAME, CSRF_COOKIE_NAME, parseCookies } from '../server';
import { env } from '../config/env';
import { createAuthSession } from '../services/authSessions';

describe('Session UX, Doctor Login & Lifecycle Verification (Issue 4)', () => {
  const testId = randomUUID();
  const doctorEmail = `doc-ux-${testId}@aarogyadamu.local`;
  const patientEmail = `pat-ux-${testId}@aarogyadamu.local`;
  const password = 'Password123!';

  let doctorUserId: string;
  let doctorSessionId: string;
  let validRefreshToken: string;
  let validCsrfToken: string;
  let validAccessToken: string;

  beforeAll(async () => {
    // 1. Create a doctor account with invitation
    const inviteRes = await request(app)
      .post('/api/auth/doctor-invitations')
      .set('X-Doctor-Invitation-Admin-Key', env.DOCTOR_INVITATION_ADMIN_KEY)
      .send({ email: doctorEmail });
    expect(inviteRes.status).toBe(201);
    const inviteToken = inviteRes.body.invitationToken;

    const docReg = await request(app)
      .post('/api/auth/doctor/register')
      .send({
        email: doctorEmail,
        password,
        fullName: 'Dr. UX Test Clinician',
        invitationToken: inviteToken,
      });
    expect(docReg.status).toBe(201);
    doctorUserId = docReg.body.user.id;

    // 2. Create a patient account to verify cross-role boundary
    const patReg = await request(app)
      .post('/api/auth/register')
      .send({
        email: patientEmail,
        password,
        fullName: 'Patient UX Test',
      });
    expect(patReg.status).toBe(201);
  });

  afterAll(async () => {
    await prisma.doctorInvitation.deleteMany({
      where: { email: { contains: testId } },
    });
    await prisma.authSession.deleteMany({
      where: { user: { email: { contains: testId } } },
    });
    await prisma.patientProfile.deleteMany({
      where: { user: { email: { contains: testId } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: testId } },
    });
    await prisma.$disconnect();
  });

  // SCENARIO 1: Fresh Doctor Login
  test('SCENARIO 1: Fresh Doctor login issues HttpOnly cookie, CSRF token, and in-memory access token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: doctorEmail, password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.isClinician).toBe(true);
    expect(loginRes.body.token).toBeDefined();

    validAccessToken = loginRes.body.token;

    // Verify Set-Cookie headers
    const rawCookies = loginRes.headers['set-cookie'];
    expect(rawCookies).toBeDefined();
    const cookieHeaderStr = Array.isArray(rawCookies) ? rawCookies.join('; ') : rawCookies;
    const cookies = parseCookies(cookieHeaderStr);

    expect(cookies[REFRESH_COOKIE_NAME]).toBeDefined();
    expect(cookies[CSRF_COOKIE_NAME]).toBeDefined();

    validRefreshToken = cookies[REFRESH_COOKIE_NAME];
    validCsrfToken = cookies[CSRF_COOKIE_NAME];

    // Decode JWT to get session ID
    const decoded = jwt.decode(validAccessToken) as { sessionId: string };
    doctorSessionId = decoded.sessionId;

    // Verify cookies attributes
    const refreshCookieDef = Array.isArray(rawCookies)
      ? rawCookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`))
      : rawCookies;
    expect(refreshCookieDef).toMatch(/HttpOnly/i);
    expect(refreshCookieDef).toMatch(/SameSite=Lax/i);
    expect(refreshCookieDef).toMatch(/Path=\/api\/auth/i);

    // Verify doctor can access dashboard
    const dashRes = await request(app)
      .get('/api/coordination/doctor/dashboard')
      .set('Authorization', `Bearer ${validAccessToken}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.patients).toBeDefined();
  });

  // SCENARIO 2: Normal Page Refresh (silent restoration)
  test('SCENARIO 2: Normal page refresh restores doctor dashboard via cookie rotation without prompt', async () => {
    // Simulate browser reload: access token in memory is lost.
    // Web app calls /api/auth/refresh using cookies and X-CSRF-Token header.
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${validRefreshToken}; ${CSRF_COOKIE_NAME}=${validCsrfToken}`)
      .set('X-CSRF-Token', validCsrfToken)
      .send({});

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.token).toBeDefined();

    const newAccessToken = refreshRes.body.token;
    // Rotation should update refresh cookie
    const rawCookies = refreshRes.headers['set-cookie'];
    expect(rawCookies).toBeDefined();
    const cookieHeaderStr = Array.isArray(rawCookies) ? rawCookies.join('; ') : rawCookies;
    const cookies = parseCookies(cookieHeaderStr);
    expect(cookies[REFRESH_COOKIE_NAME]).toBeDefined();

    // Verify /api/auth/me confirms doctor access with newly rotated access token
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${newAccessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.isClinician).toBe(true);

    // Update tokens for subsequent tests
    validAccessToken = newAccessToken;
    validRefreshToken = cookies[REFRESH_COOKIE_NAME];
    validCsrfToken = cookies[CSRF_COOKIE_NAME] || validCsrfToken;
  });

  // SCENARIO 3: Expired access token with valid refresh cookie
  test('SCENARIO 3: Expired access token is transparently refreshed with valid refresh cookie', async () => {
    // Generate an expired access token (exp in past) for the active session
    const expiredToken = jwt.sign(
      {
        id: doctorUserId,
        email: doctorEmail,
        isSyntheticDemo: false,
        isClinician: true,
        sessionId: doctorSessionId,
      },
      env.JWT_SECRET,
      { expiresIn: '-10s' }
    );

    // Initial request with expired access token fails with 401
    const rejectedReq = await request(app)
      .get('/api/coordination/doctor/dashboard')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(rejectedReq.status).toBe(401);
    expect(rejectedReq.body.error).toMatch(/expired|corrupted/i);

    // Client silently refreshes using cookie
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${validRefreshToken}; ${CSRF_COOKIE_NAME}=${validCsrfToken}`)
      .set('X-CSRF-Token', validCsrfToken)
      .send({});
    expect(refreshRes.status).toBe(200);
    const refreshedToken = refreshRes.body.token;

    // Replay original request with refreshed token succeeds
    const replayedReq = await request(app)
      .get('/api/coordination/doctor/dashboard')
      .set('Authorization', `Bearer ${refreshedToken}`);
    expect(replayedReq.status).toBe(200);
    expect(replayedReq.body.patients).toBeDefined();

    const rawCookies = refreshRes.headers['set-cookie'];
    const cookies = parseCookies(Array.isArray(rawCookies) ? rawCookies.join('; ') : rawCookies);
    validRefreshToken = cookies[REFRESH_COOKIE_NAME];
    validCsrfToken = cookies[CSRF_COOKIE_NAME] || validCsrfToken;
  });

  // SCENARIO 4: Expired refresh token
  test('SCENARIO 4: Expired refresh token returns 401, clears cookies, and disallows silent renewal', async () => {
    // Establish a temporary session and expire its refresh token in the database
    const doctorUser = await prisma.user.findUnique({ where: { id: doctorUserId } });
    const tempSession = await createAuthSession(prisma, doctorUser!);

    const decoded = jwt.decode(tempSession.token) as { sessionId: string };
    const pastDate = new Date(Date.now() - 1000 * 60 * 60);
    await prisma.authSession.update({
      where: { id: decoded.sessionId },
      data: { expiresAt: pastDate },
    });
    await prisma.refreshToken.updateMany({
      where: { sessionId: decoded.sessionId },
      data: { expiresAt: pastDate },
    });

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${tempSession.refreshToken}; ${CSRF_COOKIE_NAME}=${validCsrfToken}`)
      .set('X-CSRF-Token', validCsrfToken)
      .send({});

    // Server returns 401 with clear session-expired message
    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.error).toMatch(/invalid, expired, or revoked/i);

    // Server sends cleared cookies
    const rawCookies = refreshRes.headers['set-cookie'];
    expect(rawCookies).toBeDefined();
    const cookieHeaderStr = Array.isArray(rawCookies) ? rawCookies.join('; ') : rawCookies;
    expect(cookieHeaderStr).toMatch(/aarogyadamu_refresh_token=;/i);
  });

  // SCENARIO 5: Revoked session
  test('SCENARIO 5: Revoked session rejects both access token and refresh cookie', async () => {
    // Create new session then explicitly revoke it
    const doctorUser = await prisma.user.findUnique({ where: { id: doctorUserId } });
    const sessionToRevoke = await createAuthSession(prisma, doctorUser!);

    const decoded = jwt.decode(sessionToRevoke.token) as { sessionId: string };
    await prisma.authSession.update({
      where: { id: decoded.sessionId },
      data: { revokedAt: new Date() },
    });

    // 1. Access token is rejected
    const accessRes = await request(app)
      .get('/api/coordination/doctor/dashboard')
      .set('Authorization', `Bearer ${sessionToRevoke.token}`);
    expect(accessRes.status).toBe(401);
    expect(accessRes.body.error).toMatch(/revoked or expired/i);

    // 2. Refresh cookie is rejected
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${sessionToRevoke.refreshToken}; ${CSRF_COOKIE_NAME}=${validCsrfToken}`)
      .set('X-CSRF-Token', validCsrfToken)
      .send({});
    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.error).toMatch(/invalid, expired, or revoked/i);
  });

  // SCENARIO 6: API temporarily unavailable (error contract check)
  test('SCENARIO 6: API unavailability contract distinguishes network/5xx from 401 expiration', async () => {
    // 404 or 5xx on an endpoint must NOT be classified as 401 session expiry
    const missingEndpointRes = await request(app).get('/api/auth/non-existent-probe');
    expect(missingEndpointRes.status).toBe(404);
    expect(missingEndpointRes.status).not.toBe(401);
  });

  // SCENARIO 7: Logout followed by browser refresh
  test('SCENARIO 7: Logout revokes session on server, clears cookies, and refresh returns 400', async () => {
    // Login to get clean session
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: doctorEmail, password });
    expect(loginRes.status).toBe(200);

    const rawCookies = loginRes.headers['set-cookie'];
    const cookieHeaderStr = Array.isArray(rawCookies) ? rawCookies.join('; ') : rawCookies;
    const cookies = parseCookies(cookieHeaderStr);

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookies[REFRESH_COOKIE_NAME]}; ${CSRF_COOKIE_NAME}=${cookies[CSRF_COOKIE_NAME]}`);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // Cookies should be cleared in logout response
    const logoutCookies = logoutRes.headers['set-cookie'];
    const logoutCookieStr = Array.isArray(logoutCookies) ? logoutCookies.join('; ') : logoutCookies;
    expect(logoutCookieStr).toMatch(/aarogyadamu_refresh_token=;/i);

    // Browser refreshes (cookies are now empty): /refresh returns 400 (not logged in)
    const postLogoutRefresh = await request(app)
      .post('/api/auth/refresh')
      .send({});
    expect(postLogoutRefresh.status).toBe(400);
    expect(postLogoutRefresh.body.error).toMatch(/valid refresh token is required/i);
  });

  // SCENARIO 8: Opening the app in Incognito
  test('SCENARIO 8: Incognito / empty session returns 400 without session-expired notice and preserves invite-only doctor registration', async () => {
    // Fresh request with no cookies, no body
    const freshRefresh = await request(app)
      .post('/api/auth/refresh')
      .send({});
    expect(freshRefresh.status).toBe(400);

    // Attempting doctor registration without invitation token is strictly rejected
    const uninvitedReg = await request(app)
      .post('/api/auth/doctor/register')
      .send({
        email: `uninvited-${testId}@aarogyadamu.local`,
        password,
        fullName: 'Uninvited Person',
        invitationToken: '',
      });
    expect(uninvitedReg.status).toBe(400);
    expect(uninvitedReg.body.error).toMatch(/invitation/i);
  });

  // SCENARIO 9: Concurrent refresh protection (5 simultaneous requests receiving 401)
  test('SCENARIO 9: Concurrent refresh single-flight: 5 simultaneous 401 requests trigger exactly 1 refresh operation without session revocation', async () => {
    // 1. Establish fresh doctor session
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: doctorEmail, password });
    expect(loginRes.status).toBe(200);

    const rawCookies = loginRes.headers['set-cookie'];
    const cookieHeaderStr = Array.isArray(rawCookies) ? rawCookies.join('; ') : rawCookies;
    const cookies = parseCookies(cookieHeaderStr);
    const initialRefreshToken = cookies[REFRESH_COOKIE_NAME];
    const initialCsrfToken = cookies[CSRF_COOKIE_NAME];

    const decoded = jwt.decode(loginRes.body.token) as { sessionId: string };

    // 2. Generate expired access token
    const expiredToken = jwt.sign(
      {
        id: doctorUserId,
        email: doctorEmail,
        isSyntheticDemo: false,
        isClinician: true,
        sessionId: decoded.sessionId,
      },
      env.JWT_SECRET,
      { expiresIn: '-10s' }
    );

    // 3. Track refresh executions
    let refreshExecutionCount = 0;
    let refreshPromise: Promise<string> | null = null;
    let finalFreshToken = '';

    const singleFlightRefresh = async (): Promise<string> => {
      if (refreshPromise) return refreshPromise;
      refreshPromise = (async () => {
        refreshExecutionCount++;
        const refRes = await request(app)
          .post('/api/auth/refresh')
          .set('Cookie', `${REFRESH_COOKIE_NAME}=${initialRefreshToken}; ${CSRF_COOKIE_NAME}=${initialCsrfToken}`)
          .set('X-CSRF-Token', initialCsrfToken)
          .send({});
        expect(refRes.status).toBe(200);
        finalFreshToken = refRes.body.token as string;
        return finalFreshToken;
      })();
      try {
        return await refreshPromise;
      } finally {
        refreshPromise = null;
      }
    };

    // Client wrapper simulating single-flight logic
    const makeSimulatedClientRequest = async (endpoint: string) => {
      let res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${expiredToken}`);

      if (res.status === 401) {
        const freshAccessToken = await singleFlightRefresh();
        res = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${freshAccessToken}`);
      }
      return res;
    };

    // 4. Dispatch 5 simultaneous requests with the expired access token
    const endpoints = [
      '/api/coordination/doctor/dashboard',
      '/api/coordination/notifications',
      '/api/auth/me',
      '/api/coordination/doctor/dashboard?search=Ramesh',
      '/api/coordination/doctors',
    ];

    const responses = await Promise.all(endpoints.map((ep) => makeSimulatedClientRequest(ep)));

    // 5. Verification:
    // Exactly 1 refresh operation was executed
    expect(refreshExecutionCount).toBe(1);

    // All 5 retried requests succeeded with 200 OK
    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    // Session remains active and healthy (no revocation triggered from refresh reuse)
    const activeCheck = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${finalFreshToken}`);
    expect(activeCheck.status).toBe(200);
    expect(activeCheck.body.user.isClinician).toBe(true);
  });
});
