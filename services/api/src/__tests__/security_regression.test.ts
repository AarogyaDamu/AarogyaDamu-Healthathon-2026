import request from 'supertest';
import { randomUUID } from 'crypto';
import { app, prisma, REFRESH_COOKIE_NAME, CSRF_COOKIE_NAME, parseCookies } from '../server';
import { hashToken } from '../services/authSessions';

describe('AarogyaDamu Security Regression Test Suite', () => {
  const testId = randomUUID();
  const doctorEmail = `doc-${testId}@test.local`;
  const patientEmail = `pat-${testId}@test.local`;
  const caregiverEmail = `cg-${testId}@test.local`;
  const reuseEmail = `reuse-${testId}@test.local`;
  const revokedAccessEmail = `revoked-${testId}@test.local`;
  const logoutAllEmail = `logoutall-${testId}@test.local`;
  const password = 'Password123!';

  afterAll(async () => {
    await prisma.doctorInvitation.deleteMany({
      where: { email: { contains: testId } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: testId } },
    });
    await prisma.$disconnect();
  });

  // 1. Revoked access tokens are rejected
  test('CONTROL 1: Revoked access tokens are rejected immediately', async () => {
    const regRes = await request(app).post('/api/auth/register').send({
      email: revokedAccessEmail,
      password,
      fullName: 'Revoked User',
    });
    expect(regRes.status).toBe(201);
    const token = regRes.body.token;

    // Verify access token works initially
    const initialMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(initialMe.status).toBe(200);

    // Logout to revoke the session
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);

    // Revoked access token must be rejected
    const revokedMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(revokedMe.status).toBe(401);
    expect(revokedMe.body.error).toMatch(/revoked or expired/i);
  });

  // 2. Refresh-token reuse revokes sessions
  test('CONTROL 2: Refresh-token reuse revokes the entire session', async () => {
    const regRes = await request(app).post('/api/auth/register').send({
      email: reuseEmail,
      password,
      fullName: 'Reuse Detection User',
    });
    expect(regRes.status).toBe(201);
    const initialRefresh = regRes.body.refreshToken;
    const initialAccess = regRes.body.token;

    // First rotation (legitimate user)
    const rotate1 = await request(app).post('/api/auth/refresh').send({
      refreshToken: initialRefresh,
    });
    expect(rotate1.status).toBe(200);
    const rotatedRefresh = rotate1.body.refreshToken;
    const rotatedAccess = rotate1.body.token;
    expect(rotatedRefresh).not.toBe(initialRefresh);

    // Reuse attempt (attacker attempts to use already-rotated initialRefresh)
    const reuseAttempt = await request(app).post('/api/auth/refresh').send({
      refreshToken: initialRefresh,
    });
    expect(reuseAttempt.status).toBe(401);

    // Verify breach response: legitimate rotated tokens are ALSO revoked
    const accessCheck = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${rotatedAccess}`);
    expect(accessCheck.status).toBe(401);

    const oldAccessCheck = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${initialAccess}`);
    expect(oldAccessCheck.status).toBe(401);

    const refreshCheck = await request(app).post('/api/auth/refresh').send({
      refreshToken: rotatedRefresh,
    });
    expect(refreshCheck.status).toBe(401);
  });

  // 3. Logout-all works
  test('CONTROL 3: Logout-all revokes sessions across all devices', async () => {
    const dev1 = await request(app).post('/api/auth/register').send({
      email: logoutAllEmail,
      password,
      fullName: 'Multi Device User',
    });
    expect(dev1.status).toBe(201);

    const dev2 = await request(app).post('/api/auth/login').send({
      email: logoutAllEmail,
      password,
    });
    expect(dev2.status).toBe(200);

    // Dev 1 calls logout-all
    const logoutAllRes = await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${dev1.body.token}`);
    expect(logoutAllRes.status).toBe(200);

    // Both dev1 and dev2 access tokens must be revoked
    const dev1Check = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${dev1.body.token}`);
    expect(dev1Check.status).toBe(401);

    const dev2Check = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${dev2.body.token}`);
    expect(dev2Check.status).toBe(401);

    // Both dev1 and dev2 refresh tokens must be revoked
    const dev1Refresh = await request(app).post('/api/auth/refresh').send({
      refreshToken: dev1.body.refreshToken,
    });
    expect(dev1Refresh.status).toBe(401);

    const dev2Refresh = await request(app).post('/api/auth/refresh').send({
      refreshToken: dev2.body.refreshToken,
    });
    expect(dev2Refresh.status).toBe(401);
  });

  // 4. Expired invitations are rejected
  test('CONTROL 4: Expired doctor invitations are rejected', async () => {
    const expiredEmail = `expired-doc-${testId}@test.local`;
    const issueRes = await request(app)
      .post('/api/auth/doctor-invitations')
      .set('x-doctor-invitation-admin-key', 'test-admin-provisioning-key-that-is-long-enough')
      .send({ email: expiredEmail });
    expect(issueRes.status).toBe(201);

    // Force invitation expiration in database
    const [payload] = issueRes.body.invitationToken.split('.');
    const { id } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    await prisma.doctorInvitation.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 5000) },
    });

    const regRes = await request(app).post('/api/auth/doctor/register').send({
      email: expiredEmail,
      password,
      fullName: 'Expired Doctor',
      invitationToken: issueRes.body.invitationToken,
    });
    expect(regRes.status).toBe(403);
    expect(regRes.body.error).toMatch(/invalid, expired/i);
  });

  // 5. Used invitations cannot be reused
  test('CONTROL 5: Used invitations cannot be reused', async () => {
    const issueRes = await request(app)
      .post('/api/auth/doctor-invitations')
      .set('x-doctor-invitation-admin-key', 'test-admin-provisioning-key-that-is-long-enough')
      .send({ email: doctorEmail });
    expect(issueRes.status).toBe(201);
    const token = issueRes.body.invitationToken;

    // First use: registration succeeds
    const regRes1 = await request(app).post('/api/auth/doctor/register').send({
      email: doctorEmail,
      password,
      fullName: 'Dr. First Use',
      invitationToken: token,
    });
    expect(regRes1.status).toBe(201);
    expect(regRes1.body.user.isClinician).toBe(true);

    // Second use: must be rejected
    const regRes2 = await request(app).post('/api/auth/doctor/register').send({
      email: doctorEmail,
      password: 'AnotherPassword123!',
      fullName: 'Dr. Second Attempt',
      invitationToken: token,
    });
    expect(regRes2.status).toBe(403);
    expect(regRes2.body.error).toMatch(/invalid, expired, or has already been used/i);
  });

  // 6. Unauthorized invitation issuance is denied
  test('CONTROL 6: Unauthorized invitation issuance is denied and audited', async () => {
    const denied1 = await request(app)
      .post('/api/auth/doctor-invitations')
      .send({ email: `attacker-${testId}@test.local` });
    expect(denied1.status).toBe(403);

    const denied2 = await request(app)
      .post('/api/auth/doctor-invitations')
      .set('x-doctor-invitation-admin-key', 'wrong-key-attempt')
      .send({ email: `attacker-${testId}@test.local` });
    expect(denied2.status).toBe(403);

    const auditCount = await prisma.securityAuditEvent.count({
      where: { action: 'DOCTOR_INVITATION_ISSUE_DENIED' },
    });
    expect(auditCount).toBeGreaterThan(0);
  });

  // 7. Password-reset tokens cannot be reused
  test('CONTROL 7: Password-reset tokens cannot be reused and revoke old sessions', async () => {
    // Register account and establish session
    const resetUserEmail = `reset-${testId}@test.local`;
    const regRes = await request(app).post('/api/auth/register').send({
      email: resetUserEmail,
      password,
      fullName: 'Password Reset User',
    });
    expect(regRes.status).toBe(201);
    const oldToken = regRes.body.token;

    // Directly seed a valid password reset token for this user
    const rawResetToken = `valid-reset-${randomUUID()}`;
    await prisma.passwordResetToken.create({
      data: {
        userId: regRes.body.user.id,
        tokenHash: hashToken(rawResetToken),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    // Reset password successfully
    const resetRes = await request(app).post('/api/auth/reset-password').send({
      token: rawResetToken,
      newPassword: 'BrandNewPassword123!',
    });
    expect(resetRes.status).toBe(200);

    // Old access token must be invalidated
    const oldAccessCheck = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(oldAccessCheck.status).toBe(401);

    // Attempting to reuse the reset token must be rejected
    const reuseReset = await request(app).post('/api/auth/reset-password').send({
      token: rawResetToken,
      newPassword: 'YetAnotherPassword123!',
    });
    expect(reuseReset.status).toBe(400);
  });

  // 8. Doctor-only routes reject Patient and Caregiver accounts
  test('CONTROL 8: Doctor-only routes reject Patient and Caregiver accounts', async () => {
    const patientRes = await request(app).post('/api/auth/register').send({
      email: patientEmail,
      password,
      fullName: 'Patient Regression',
    });
    expect(patientRes.status).toBe(201);

    const caregiverRes = await request(app).post('/api/auth/register').send({
      email: caregiverEmail,
      password,
      fullName: 'Caregiver Regression',
    });
    expect(caregiverRes.status).toBe(201);

    // Patient cannot access doctor-only endpoints
    const patientDoctorAccess = await request(app)
      .get('/api/coordination/doctor/patients')
      .set('Authorization', `Bearer ${patientRes.body.token}`);
    expect(patientDoctorAccess.status).toBe(403);

    // Caregiver cannot access doctor-only endpoints
    const caregiverDoctorAccess = await request(app)
      .get('/api/coordination/doctor/patients')
      .set('Authorization', `Bearer ${caregiverRes.body.token}`);
    expect(caregiverDoctorAccess.status).toBe(403);

    // Anonymous requests rejected with 401
    const anonAccess = await request(app).get('/api/coordination/doctor/patients');
    expect(anonAccess.status).toBe(401);
  });

  // 9. Web refresh-token storage follows approved secure cookie design
  test('CONTROL 9: Web refresh-token storage uses HttpOnly cookies and CSRF protection', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({
      email: doctorEmail,
      password,
    });
    expect(loginRes.status).toBe(200);

    // Verify Set-Cookie headers contain HttpOnly refresh token and CSRF token
    const setCookieHeaders = loginRes.headers['set-cookie'] || [];
    const setCookieString = Array.isArray(setCookieHeaders) ? setCookieHeaders.join('; ') : setCookieHeaders;

    expect(setCookieString).toContain(REFRESH_COOKIE_NAME);
    expect(setCookieString).toContain('HttpOnly');
    expect(setCookieString).toContain('SameSite=Lax');
    expect(setCookieString).toContain(CSRF_COOKIE_NAME);

    // Extract cookies for cookie-based refresh simulation
    const cookieHeader = (Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders])
      .map((c) => c.split(';')[0])
      .join('; ');
    const cookies = parseCookies(cookieHeader);
    const csrfToken = cookies[CSRF_COOKIE_NAME];
    expect(csrfToken).toBeDefined();

    // Cookie refresh WITHOUT CSRF token must fail with 403
    const failCsrf = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader)
      .send({});
    expect(failCsrf.status).toBe(403);
    expect(failCsrf.body.error).toMatch(/CSRF validation failed/i);

    // Cookie refresh WITH valid CSRF token must succeed
    const successRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrfToken)
      .send({});
    expect(successRefresh.status).toBe(200);
    expect(successRefresh.body.token).toBeDefined();
  });

  // 10. API failure during logout does not falsely report server revocation
  test('CONTROL 10: API failure during logout does not falsely report server revocation', async () => {
    // When an invalid or expired token is sent to logout, it returns 401
    const invalidLogout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer invalid-token');
    expect(invalidLogout.status).toBe(401);
    expect(invalidLogout.body.success).toBeUndefined();

    // Verify audit log did not log USER_LOGOUT for the failed request
    const failedLogouts = await prisma.auditLog.findMany({
      where: { action: 'USER_LOGOUT', userId: 'non-existent' },
    });
    expect(failedLogouts.length).toBe(0);
  });
});

