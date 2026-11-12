import request from 'supertest';
import { randomUUID } from 'crypto';
import { app, prisma } from '../server';
import { env } from '../config/env';
import * as emailService from '../services/emailService';
import { hashToken } from '../services/authSessions';

describe('Authentication security and Doctor-only API authorization', () => {
  const suffix = randomUUID();
  const patientEmail = `patient-${suffix}@test.local`;
  const caregiverEmail = `caregiver-${suffix}@test.local`;
  const doctorEmail = `doctor-${suffix}@test.local`;
  const expiredDoctorEmail = `expired-${suffix}@test.local`;
  const sessionEmail = `session-${suffix}@test.local`;
  const logoutEmail = `logout-${suffix}@test.local`;
  const logoutAllEmail = `logout-all-${suffix}@test.local`;
  const password = 'Password123!';
  let doctorAccessToken = '';
  const authorization = (token: string) => ['Bearer', token].join(' ');

  afterAll(async () => {
    await prisma.doctorInvitation.deleteMany({
      where: { email: { in: [doctorEmail, expiredDoctorEmail] } },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [patientEmail, caregiverEmail, doctorEmail, expiredDoctorEmail, sessionEmail, logoutEmail, logoutAllEmail],
        },
      },
    });
    await prisma.$disconnect();
  });

  test('patient and caregiver sessions are rejected by Doctor APIs', async () => {
    const patient = await request(app).post('/api/auth/register').send({
      email: patientEmail,
      password,
      fullName: 'Patient Test',
      isClinician: true,
    });
    expect(patient.status).toBe(201);
    expect(patient.body.user.isClinician).toBe(false);
    expect(patient.body.refreshToken).toEqual(expect.any(String));

    const patientAccess = await request(app)
      .get('/api/coordination/doctor/patients')
      .set('Authorization', authorization(patient.body.token));
    expect(patientAccess.status).toBe(403);

    const caregiver = await request(app).post('/api/auth/register').send({
      email: caregiverEmail,
      password,
      fullName: 'Caregiver Test',
      role: 'CAREGIVER',
    });
    expect(caregiver.status).toBe(201);
    expect(caregiver.body.user.isClinician).toBe(false);

    const caregiverAccess = await request(app)
      .get('/api/coordination/doctor/patients')
      .set('Authorization', authorization(caregiver.body.token));
    expect(caregiverAccess.status).toBe(403);
    const anonymousAccess = await request(app).get('/api/coordination/doctor/patients');
    expect(anonymousAccess.status).toBe(401);
  });

  test('Doctor invitations are authorized, email-bound, expiring, audited, and one-time', async () => {
    const unauthorized = await request(app)
      .post('/api/auth/doctor-invitations')
      .send({ email: doctorEmail });
    expect(unauthorized.status).toBe(403);
    expect(await prisma.securityAuditEvent.count({
      where: { action: 'DOCTOR_INVITATION_ISSUE_DENIED' },
    })).toBeGreaterThan(0);

    const expiredIssue = await request(app)
      .post('/api/auth/doctor-invitations')
      .set('x-doctor-invitation-admin-key', 'test-admin-provisioning-key-that-is-long-enough')
      .send({ email: expiredDoctorEmail });
    expect(expiredIssue.status).toBe(201);
    const [expiredPayload] = expiredIssue.body.invitationToken.split('.');
    const expiredId = JSON.parse(Buffer.from(expiredPayload, 'base64url').toString('utf8')).id;
    await prisma.doctorInvitation.update({
      where: { id: expiredId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expiredRedemption = await request(app).post('/api/auth/doctor/register').send({
      email: expiredDoctorEmail,
      password,
      fullName: 'Expired Doctor',
      invitationToken: expiredIssue.body.invitationToken,
    });
    expect(expiredRedemption.status).toBe(403);

    const issued = await request(app)
      .post('/api/auth/doctor-invitations')
      .set('x-doctor-invitation-admin-key', 'test-admin-provisioning-key-that-is-long-enough')
      .send({ email: doctorEmail });
    expect(issued.status).toBe(201);
    expect(issued.body.expiresAt).toBeDefined();
    expect(await prisma.securityAuditEvent.count({
      where: { action: 'DOCTOR_INVITATION_ISSUED', subject: doctorEmail },
    })).toBe(1);

    const wrongEmail = await request(app).post('/api/auth/doctor/register').send({
      email: `other-${suffix}@test.local`,
      password,
      fullName: 'Doctor Test',
      invitationToken: issued.body.invitationToken,
    });
    expect(wrongEmail.status).toBe(403);

    const registration = await request(app).post('/api/auth/doctor/register').send({
      email: doctorEmail,
      password,
      fullName: 'Doctor Test',
      invitationToken: issued.body.invitationToken,
    });
    expect(registration.status).toBe(201);
    expect(registration.body.user.isClinician).toBe(true);
    doctorAccessToken = registration.body.token;

    const reused = await request(app).post('/api/auth/doctor/register').send({
      email: doctorEmail,
      password,
      fullName: 'Doctor Test',
      invitationToken: issued.body.invitationToken,
    });
    expect(reused.status).toBe(403);

    const doctorAccess = await request(app)
      .get('/api/coordination/doctor/patients')
      .set('Authorization', authorization(registration.body.token));
    expect(doctorAccess.status).toBe(200);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const additional = await request(app)
        .post('/api/auth/doctor-invitations')
        .set('x-doctor-invitation-admin-key', 'test-admin-provisioning-key-that-is-long-enough')
        .send({ email: doctorEmail });
      expect(additional.status).toBe(201);
    }
    const limited = await request(app)
      .post('/api/auth/doctor-invitations')
      .set('x-doctor-invitation-admin-key', 'test-admin-provisioning-key-that-is-long-enough')
      .send({ email: doctorEmail });
    expect(limited.status).toBe(429);
  });

  test('refresh rotation detects reuse and invalidates copied access tokens', async () => {
    const registration = await request(app).post('/api/auth/register').send({
      email: sessionEmail,
      password,
      fullName: 'Session Test',
    });
    expect(registration.status).toBe(201);

    const rotated = await request(app).post('/api/auth/refresh').send({
      refreshToken: registration.body.refreshToken,
    });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).not.toBe(registration.body.refreshToken);

    const reuse = await request(app).post('/api/auth/refresh').send({
      refreshToken: registration.body.refreshToken,
    });
    expect(reuse.status).toBe(401);
    const copiedAccess = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authorization(registration.body.token));
    expect(copiedAccess.status).toBe(401);
    const rotatedAccess = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authorization(rotated.body.token));
    expect(rotatedAccess.status).toBe(401);
  });

  test('logout revokes the current session and logout-all revokes other devices', async () => {
    const registration = await request(app).post('/api/auth/register').send({
      email: logoutEmail,
      password,
      fullName: 'Logout Test',
    });
    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', authorization(registration.body.token));
    expect(logout.status).toBe(200);
    const copiedAccess = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authorization(registration.body.token));
    expect(copiedAccess.status).toBe(401);
    const revokedRefresh = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: registration.body.refreshToken });
    expect(revokedRefresh.status).toBe(401);

    const firstDevice = await request(app).post('/api/auth/register').send({
      email: logoutAllEmail,
      password,
      fullName: 'Logout All Test',
    });
    const secondDevice = await request(app).post('/api/auth/login').send({
      email: logoutAllEmail,
      password,
    });
    const logoutAll = await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', authorization(firstDevice.body.token));
    expect(logoutAll.status).toBe(200);
    const otherDevice = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authorization(secondDevice.body.token));
    expect(otherDevice.status).toBe(401);
  });

  test('staging environment with disabled email returns documented HTTP 503 for password reset', async () => {
    const prevAppEnv = env.APP_ENV;
    const prevEmailProvider = env.EMAIL_PROVIDER;
    try {
      (env as any).APP_ENV = 'staging';
      (env as any).EMAIL_PROVIDER = 'disabled';

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', '203.0.113.111')
        .send({ email: doctorEmail });

      expect(response.status).toBe(503);
      expect(response.body.error).toContain('disabled or unavailable in this environment');
    } finally {
      (env as any).APP_ENV = prevAppEnv;
      (env as any).EMAIL_PROVIDER = prevEmailProvider;
    }
  });

  test('password-reset requests do not enumerate accounts, and tokens are one-time and expire', async () => {
    const emailSendSpy = jest.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValue(undefined);

    try {
      const firstResponse = await request(app)
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', '203.0.113.222')
        .send({ email: doctorEmail });
      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body.resetToken).toBeUndefined();
      expect(emailSendSpy).toHaveBeenCalledWith(doctorEmail, expect.any(String));

      const unknownEmail = await request(app)
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', '203.0.113.222')
        .send({ email: `unknown-${suffix}@test.local` });
      expect(unknownEmail.status).toBe(firstResponse.status);
      expect(unknownEmail.body).toEqual(firstResponse.body);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const allowed = await request(app)
          .post('/api/auth/forgot-password')
          .set('X-Forwarded-For', '203.0.113.222')
          .send({ email: `unknown-${suffix}@test.local` });
        expect(allowed.status).toBe(200);
      }
      const limitedReset = await request(app)
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', '203.0.113.222')
        .send({ email: `unknown-${suffix}@test.local` });
      expect(limitedReset.status).toBe(429);

      const expiredToken = `expired-${suffix}`;
      await prisma.passwordResetToken.create({
        data: {
          userId: (await prisma.user.findUniqueOrThrow({ where: { email: doctorEmail } })).id,
          tokenHash: hashToken(expiredToken),
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      const expired = await request(app).post('/api/auth/reset-password').send({
        token: expiredToken,
        newPassword: 'ChangedPassword123!',
      });
      expect(expired.status).toBe(400);

      const resetToken = `usable-${suffix}`;
      const resetUser = await prisma.user.findUniqueOrThrow({ where: { email: doctorEmail } });
      await prisma.passwordResetToken.create({
        data: {
          userId: resetUser.id,
          tokenHash: hashToken(resetToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      const reset = await request(app).post('/api/auth/reset-password').send({
        token: resetToken,
        newPassword: 'ChangedPassword123!',
      });
      expect(reset.status).toBe(200);
      const oldSession = await request(app)
        .get('/api/auth/me')
        .set('Authorization', authorization(doctorAccessToken));
      expect(oldSession.status).toBe(401);

      const reused = await request(app).post('/api/auth/reset-password').send({
        token: resetToken,
        newPassword: 'AnotherPassword123!',
      });
      expect(reused.status).toBe(400);
    } finally {
      emailSendSpy.mockRestore();
    }
  });
});
