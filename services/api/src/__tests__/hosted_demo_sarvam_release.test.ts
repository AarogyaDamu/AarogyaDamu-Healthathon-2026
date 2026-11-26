import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app, prisma } from '../server';
import { env } from '../config/env';
import { SarvamOcrService, SarvamOcrUnavailableError } from '../services/sarvamOcrService';
import { isDurableStorageAvailable, PrivateStorageUnavailableError, savePrivateFile } from '../services/storageService';
import { withTenantTransaction } from '../db/tenantContext';

const ADMIN_KEY = 'test-admin-provisioning-key-that-is-long-enough';
const VALID_PDF_HEADER = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

describe('Hosted Demo (Render Free + Neon Free) & Sarvam OCR Regression Suite', () => {
  const runId = randomUUID().slice(0, 8);
  const createdUserIds: string[] = [];
  const createdPracticeIds: string[] = [];
  let patientToken = '';
  let patientId = '';
  let otherPatientToken = '';
  let otherPatientId = '';
  let doctorToken = '';
  let doctorId = '';
  let unassignedDoctorToken = '';
  let unassignedDoctorId = '';

  const doctorEmail = `hosted-doc-${runId}@aarogyadamu.local`;
  const unassignedDoctorEmail = `hosted-unassigned-doc-${runId}@aarogyadamu.local`;
  const patientEmail = `hosted-patient-${runId}@aarogyadamu.local`;
  const otherPatientEmail = `hosted-other-patient-${runId}@aarogyadamu.local`;
  const password = 'HostedDemoStrongPassword123!';

  beforeAll(async () => {
    // Provision verified doctor via admin-controlled endpoint
    const docRes = await request(app)
      .post('/api/auth/admin/doctors')
      .set('x-doctor-invitation-admin-key', ADMIN_KEY)
      .send({
        email: doctorEmail,
        password,
        fullName: 'Dr. Hosted Demo Verify',
      });
    expect(docRes.status).toBe(201);
    expect(docRes.body.user.isClinician).toBe(true);
    doctorToken = docRes.body.token;
    doctorId = docRes.body.user.id;
    createdUserIds.push(doctorId);

    const unassignedRes = await request(app)
      .post('/api/auth/admin/doctors')
      .set('x-doctor-invitation-admin-key', ADMIN_KEY)
      .send({
        email: unassignedDoctorEmail,
        password,
        fullName: 'Dr. Unassigned Verify',
      });
    expect(unassignedRes.status).toBe(201);
    unassignedDoctorToken = unassignedRes.body.token;
    unassignedDoctorId = unassignedRes.body.user.id;
    createdUserIds.push(unassignedDoctorId);

    // Public Patient Registration remains enabled and creates non-clinician patient
    const patRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: patientEmail,
        password,
        fullName: 'Hosted Patient Verify',
      });
    expect(patRes.status).toBe(201);
    expect(patRes.body.user.isClinician).toBe(false);
    patientToken = patRes.body.token;
    patientId = patRes.body.user.id;
    createdUserIds.push(patientId);

    const otherPatRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: otherPatientEmail,
        password,
        fullName: 'Hosted Other Patient',
      });
    expect(otherPatRes.status).toBe(201);
    otherPatientToken = otherPatRes.body.token;
    otherPatientId = otherPatRes.body.user.id;
    createdUserIds.push(otherPatientId);

    // Establish active practice & DoctorPatientAssignment inside system worker context
    await withTenantTransaction(
      prisma,
      { isSystemWorker: true, workerScope: 'DEMO_WORKER' },
      async (tx) => {
        const practice = await tx.practice.create({
          data: {
            name: `Hosted Demo Clinic ${runId}`,
            slug: `hosted-demo-${runId}`,
            registrationNumber: `REG-HOSTED-${runId}`,
            memberships: {
              create: {
                userId: doctorId,
                role: 'OWNER',
                isActive: true,
              },
            },
          },
        });
        createdPracticeIds.push(practice.id);
        await tx.doctorPatientAssignment.create({
          data: {
            doctorId,
            patientId,
            status: 'ACTIVE',
            activatedAt: new Date(),
          },
        });
      },
    );
  });

  afterAll(async () => {
    await withTenantTransaction(
      prisma,
      { isSystemWorker: true, workerScope: 'SECURITY_RECORDER' },
      async (tx) => {
        await tx.securityAuditEvent.deleteMany({
          where: { subject: { in: [doctorEmail, unassignedDoctorEmail, patientEmail, otherPatientEmail] } },
        });
        await tx.auditLog.deleteMany({
          where: { OR: [{ userId: { in: createdUserIds } }, { actorId: { in: createdUserIds } }] },
        });
        await tx.doctorPatientAssignment.deleteMany({
          where: { OR: [{ patientId: { in: createdUserIds } }, { doctorId: { in: createdUserIds } }] },
        });
        await tx.practiceMembership.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await tx.practice.deleteMany({
          where: { id: { in: createdPracticeIds } },
        });
        await tx.refreshToken.deleteMany({ where: { session: { userId: { in: createdUserIds } } } });
        await tx.authSession.deleteMany({ where: { userId: { in: createdUserIds } } });
        await tx.patientProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
        await tx.user.deleteMany({ where: { id: { in: createdUserIds } } });
      },
    );
    await prisma.$disconnect();
  });

  test('disables public doctor self-registration while allowing admin doctor provisioning and login', async () => {
    const publicSignup = await request(app).post('/api/auth/doctor/register').send({
      email: `unauthorized-doc-${runId}@aarogyadamu.local`,
      password,
      fullName: 'Public Signup Attempt',
      invitationToken: 'fake-token',
    });
    expect(publicSignup.status).toBe(403);
    expect(publicSignup.body.code).toBe('PUBLIC_DOCTOR_REGISTRATION_DISABLED');

    const unauthenticatedAdminProvision = await request(app).post('/api/auth/admin/doctors').send({
      email: `unauthorized-doc-${runId}@aarogyadamu.local`,
      password,
      fullName: 'No Admin Key',
    });
    expect(unauthenticatedAdminProvision.status).toBe(403);

    const loginRes = await request(app).post('/api/auth/login').send({
      email: doctorEmail,
      password,
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.isClinician).toBe(true);
    expect(loginRes.body.token).toBeTruthy();

    // Patient login stays non-clinician
    const patientLogin = await request(app).post('/api/auth/login').send({
      email: patientEmail,
      password,
    });
    expect(patientLogin.status).toBe(200);
    expect(patientLogin.body.user.isClinician).toBe(false);
  });

  test('disables public forgot-password and reset-password honestly in hosted staging/email-disabled profile', async () => {
    const prevAppEnv = env.APP_ENV;
    const prevEmailProvider = env.EMAIL_PROVIDER;
    const prevAllowReset = env.ALLOW_PUBLIC_PASSWORD_RESET;

    try {
      (env as any).APP_ENV = 'staging';
      (env as any).EMAIL_PROVIDER = 'disabled';
      (env as any).ALLOW_PUBLIC_PASSWORD_RESET = false;

      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', '198.51.100.201')
        .send({ email: patientEmail });
      expect(forgotRes.status).toBe(503);
      expect(forgotRes.body.code).toBe('PASSWORD_RESET_DISABLED');
      expect(forgotRes.body.error).not.toMatch(/sent|check your email/i);

      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'fake-reset-token', newPassword: 'ChangedPassword123!' });
      expect(resetRes.status).toBe(503);
      expect(resetRes.body.code).toBe('PASSWORD_RESET_DISABLED');
    } finally {
      (env as any).APP_ENV = prevAppEnv;
      (env as any).EMAIL_PROVIDER = prevEmailProvider;
      (env as any).ALLOW_PUBLIC_PASSWORD_RESET = prevAllowReset;
    }
  });

  test('fails closed on permanent uploads when NODE_ENV=production without durable GCS storage', async () => {
    const prevNodeEnv = env.NODE_ENV;
    const prevBucket = env.GOOGLE_CLOUD_STORAGE_BUCKET;
    const prevSarvam = process.env.SARVAM_API_KEY;
    const prevEnvSarvam = env.SARVAM_API_KEY;
    const prevOcrProvider = env.MEDICAL_REPORT_OCR_PROVIDER;
    const prevProcOcrProvider = process.env.MEDICAL_REPORT_OCR_PROVIDER;

    try {
      (env as any).NODE_ENV = 'production';
      (env as any).GOOGLE_CLOUD_STORAGE_BUCKET = undefined;
      (env as any).MEDICAL_REPORT_OCR_PROVIDER = 'sarvam';
      process.env.MEDICAL_REPORT_OCR_PROVIDER = 'sarvam';
      (env as any).SARVAM_API_KEY = undefined;
      process.env.SARVAM_API_KEY = '';

      expect(isDurableStorageAvailable()).toBe(false);
      await expect(
        savePrivateFile(patientId, 'report.pdf', Buffer.from(VALID_PDF_HEADER), 'application/pdf'),
      ).rejects.toThrow(PrivateStorageUnavailableError);

      const beforeCount = await withTenantTransaction(
        prisma,
        { isSystemWorker: true, workerScope: 'DEMO_WORKER' },
        (tx) => tx.healthDocument.count({ where: { userId: patientId } }),
      );

      const uploadRes = await request(app)
        .post('/api/documents/upload-report')
        .set('Authorization', `Bearer ${patientToken}`)
        .field('title', 'No Ephemeral Storage Test')
        .attach('file', Buffer.from(VALID_PDF_HEADER), {
          filename: 'no-storage.pdf',
          contentType: 'application/pdf',
        });

      expect(uploadRes.status).toBe(503);
      expect(uploadRes.body.code).toBe('DURABLE_STORAGE_UNAVAILABLE');

      const docRouteRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${patientToken}`)
        .field('title', 'Direct Root Upload Blocked')
        .attach('file', Buffer.from(VALID_PDF_HEADER), {
          filename: 'blocked.pdf',
          contentType: 'application/pdf',
        });
      expect(docRouteRes.status).toBe(503);
      expect(docRouteRes.body.code).toBe('DURABLE_STORAGE_UNAVAILABLE');

      const afterCount = await withTenantTransaction(
        prisma,
        { isSystemWorker: true, workerScope: 'DEMO_WORKER' },
        (tx) => tx.healthDocument.count({ where: { userId: patientId } }),
      );
      expect(afterCount).toBe(beforeCount);

      // Capabilities reported accurately on GET /api/documents
      const listRes = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.capabilities.persistentStorageAvailable).toBe(false);
      expect(listRes.body.capabilities.storageProvider).toBe('disabled');
      expect(listRes.body.capabilities.sarvamOcrConfigured).toBe(false);
      expect(listRes.body.capabilities.temporaryOcrAvailable).toBe(false);
    } finally {
      (env as any).NODE_ENV = prevNodeEnv;
      (env as any).GOOGLE_CLOUD_STORAGE_BUCKET = prevBucket;
      (env as any).MEDICAL_REPORT_OCR_PROVIDER = prevOcrProvider;
      if (prevProcOcrProvider === undefined) delete process.env.MEDICAL_REPORT_OCR_PROVIDER;
      else process.env.MEDICAL_REPORT_OCR_PROVIDER = prevProcOcrProvider;
      (env as any).SARVAM_API_KEY = prevEnvSarvam;
      if (prevSarvam === undefined) delete process.env.SARVAM_API_KEY;
      else process.env.SARVAM_API_KEY = prevSarvam;
    }
  });

  test('Sarvam OCR rejects cleanly (503) without fake fallback when key missing or upstream fails', async () => {
    const prevSarvam = process.env.SARVAM_API_KEY;
    const prevEnvSarvam = env.SARVAM_API_KEY;
    const prevOcrProvider = env.MEDICAL_REPORT_OCR_PROVIDER;
    const prevProcOcrProvider = process.env.MEDICAL_REPORT_OCR_PROVIDER;
    const origFetch = global.fetch;

    try {
      (env as any).MEDICAL_REPORT_OCR_PROVIDER = 'sarvam';
      process.env.MEDICAL_REPORT_OCR_PROVIDER = 'sarvam';
      (env as any).SARVAM_API_KEY = undefined;
      delete process.env.SARVAM_API_KEY;

      // 1. Direct service call rejects cleanly instead of synthesizing fake text
      const buf1 = Buffer.from(VALID_PDF_HEADER);
      await expect(
        SarvamOcrService.processTemporaryBuffer(buf1, 'application/pdf', 'missing-key.pdf'),
      ).rejects.toThrow(SarvamOcrUnavailableError);

      // 2. Endpoint returns 503 SARVAM_OCR_UNAVAILABLE without saving anything
      const unconfiguredRes = await request(app)
        .post('/api/ocr/extract-temporary')
        .set('Authorization', `Bearer ${patientToken}`)
        .attach('file', Buffer.from(VALID_PDF_HEADER), {
          filename: 'missing-key.pdf',
          contentType: 'application/pdf',
        });
      expect(unconfiguredRes.status).toBe(503);
      expect(unconfiguredRes.body.code).toBe('SARVAM_OCR_UNAVAILABLE');
      expect(unconfiguredRes.body.persistentStorage).toBe(false);
      expect(unconfiguredRes.body.temporaryCleanedUp).toBe(true);

      // 3. Upstream HTTP 502 error from Sarvam fails closed (never falls back to LOCAL_FALLBACK)
      process.env.SARVAM_API_KEY = 'sk_test_sarvam_hosted_key_valid_len';
      global.fetch = (async () => ({
        ok: false,
        status: 502,
        text: async () => 'Sarvam gateway unavailable',
      })) as unknown as typeof fetch;

      const buf2 = Buffer.from(VALID_PDF_HEADER);
      await expect(
        SarvamOcrService.processTemporaryBuffer(buf2, 'application/pdf', 'upstream-fail.pdf'),
      ).rejects.toThrow(SarvamOcrUnavailableError);
      // Buffer still scrubbed on error
      expect(buf2.every((byte) => byte === 0)).toBe(true);

      const upstreamFailRes = await request(app)
        .post('/api/ocr/extract-temporary')
        .set('Authorization', `Bearer ${patientToken}`)
        .attach('file', Buffer.from(VALID_PDF_HEADER), {
          filename: 'upstream-fail.pdf',
          contentType: 'application/pdf',
        });
      expect(upstreamFailRes.status).toBe(503);
      expect(upstreamFailRes.body.code).toBe('SARVAM_REQUEST_FAILED');
    } finally {
      global.fetch = origFetch;
      (env as any).SARVAM_API_KEY = prevEnvSarvam;
      (env as any).MEDICAL_REPORT_OCR_PROVIDER = prevOcrProvider;
      if (prevProcOcrProvider === undefined) delete process.env.MEDICAL_REPORT_OCR_PROVIDER;
      else process.env.MEDICAL_REPORT_OCR_PROVIDER = prevProcOcrProvider;
      if (prevSarvam === undefined) delete process.env.SARVAM_API_KEY;
      else process.env.SARVAM_API_KEY = prevSarvam;
    }
  });

  test('Temporary Sarvam OCR processes in memory, scrubs buffer, saves no durable file, and enforces authorization', async () => {
    const prevSarvam = process.env.SARVAM_API_KEY;
    const prevEnvSarvam = env.SARVAM_API_KEY;
    const prevOcrProvider = env.MEDICAL_REPORT_OCR_PROVIDER;
    const prevProcOcrProvider = process.env.MEDICAL_REPORT_OCR_PROVIDER;
    const prevNodeEnv = env.NODE_ENV;
    const prevBucket = env.GOOGLE_CLOUD_STORAGE_BUCKET;
    const origFetch = global.fetch;

    try {
      (env as any).NODE_ENV = 'production';
      (env as any).GOOGLE_CLOUD_STORAGE_BUCKET = undefined;
      (env as any).MEDICAL_REPORT_OCR_PROVIDER = 'sarvam';
      process.env.MEDICAL_REPORT_OCR_PROVIDER = 'sarvam';
      (env as any).SARVAM_API_KEY = 'sk_test_sarvam_hosted_key_valid_len';
      process.env.SARVAM_API_KEY = 'sk_test_sarvam_hosted_key_valid_len';

      global.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          parsed_text: 'Diagnostic Lab Report\nFasting Blood Glucose: 114 mg/dL\nHbA1c: 6.7%',
          pages_processed: 1,
        }),
      })) as unknown as typeof fetch;

      // Cross-patient & unassigned-doctor isolation enforced BEFORE processing
      const crossPatientRes = await request(app)
        .post('/api/ocr/extract-temporary')
        .set('Authorization', `Bearer ${otherPatientToken}`)
        .set('X-Target-Patient-Id', patientId)
        .attach('file', Buffer.from(VALID_PDF_HEADER), {
          filename: 'cross-tenant.pdf',
          contentType: 'application/pdf',
        });
      expect(crossPatientRes.status).toBe(403);

      const unassignedDocRes = await request(app)
        .post('/api/ocr/extract-temporary')
        .set('Authorization', `Bearer ${unassignedDoctorToken}`)
        .set('X-Target-Patient-Id', patientId)
        .attach('file', Buffer.from(VALID_PDF_HEADER), {
          filename: 'unassigned.pdf',
          contentType: 'application/pdf',
        });
      expect(unassignedDocRes.status).toBe(403);

      // Direct buffer scrubbing verification
      const rawBuf = Buffer.from(VALID_PDF_HEADER);
      const direct = await SarvamOcrService.processTemporaryBuffer(rawBuf, 'application/pdf', 'lab.pdf');
      expect(direct.engine).toBe('SARVAM_DOCUMENT_AI');
      expect(direct.persistentStorage).toBe(false);
      expect(direct.temporaryCleanedUp).toBe(true);
      expect(direct.rawOcrText).toContain('Fasting Blood Glucose: 114 mg/dL');
      expect(rawBuf.every((b) => b === 0)).toBe(true);

      // Assigned doctor temporary OCR call succeeds without writing any disk files or HealthDocument rows
      const uploadsPatientDir = path.resolve(env.STORAGE_DIR, patientId);
      const existedBefore = fs.existsSync(uploadsPatientDir);
      const beforeDocs = await withTenantTransaction(
        prisma,
        { isSystemWorker: true, workerScope: 'DEMO_WORKER' },
        (tx) => tx.healthDocument.count({ where: { userId: patientId } }),
      );

      const docTempRes = await request(app)
        .post('/api/ocr/extract-temporary')
        .set('Authorization', `Bearer ${doctorToken}`)
        .set('X-Target-Patient-Id', patientId)
        .attach('file', Buffer.from(VALID_PDF_HEADER), {
          filename: 'assigned-doc-scan.pdf',
          contentType: 'application/pdf',
        });

      expect(docTempRes.status).toBe(200);
      expect(docTempRes.body.success).toBe(true);
      expect(docTempRes.body.mode).toBe('TEMPORARY_IN_MEMORY');
      expect(docTempRes.body.persistentStorage).toBe(false);
      expect(docTempRes.body.temporaryCleanedUp).toBe(true);
      expect(docTempRes.body.engine).toBe('SARVAM_DOCUMENT_AI');
      expect(docTempRes.body.rawOcrText).toContain('HbA1c: 6.7%');

      const afterDocs = await withTenantTransaction(
        prisma,
        { isSystemWorker: true, workerScope: 'DEMO_WORKER' },
        (tx) => tx.healthDocument.count({ where: { userId: patientId } }),
      );
      expect(afterDocs).toBe(beforeDocs);
      if (!existedBefore) {
        expect(fs.existsSync(uploadsPatientDir)).toBe(false);
      }

      // Honest readiness telemetry
      const readyRes = await request(app).get('/health/ready');
      expect([200, 503]).toContain(readyRes.status);
      expect(readyRes.body.checks.sarvamOcr).toBe('configured_unverified');
      expect(readyRes.body.checks.storage).toBe('disabled');
      expect(readyRes.body.capabilities.persistentDocumentStorage).toBe(false);
      expect(readyRes.body.capabilities.temporarySarvamOcr).toBe(true);
      expect(readyRes.body.capabilities.publicDoctorRegistration).toBe(false);
      expect(readyRes.body.capabilities.publicPasswordReset).toBe(false);
    } finally {
      global.fetch = origFetch;
      (env as any).NODE_ENV = prevNodeEnv;
      (env as any).GOOGLE_CLOUD_STORAGE_BUCKET = prevBucket;
      (env as any).MEDICAL_REPORT_OCR_PROVIDER = prevOcrProvider;
      if (prevProcOcrProvider === undefined) delete process.env.MEDICAL_REPORT_OCR_PROVIDER;
      else process.env.MEDICAL_REPORT_OCR_PROVIDER = prevProcOcrProvider;
      (env as any).SARVAM_API_KEY = prevEnvSarvam;
      if (prevSarvam === undefined) delete process.env.SARVAM_API_KEY;
      else process.env.SARVAM_API_KEY = prevSarvam;
    }
  });

  test('health/staging-seed stays hidden outside staging and requires admin key in staging', async () => {
    const prevAppEnv = env.APP_ENV;
    try {
      (env as any).APP_ENV = 'development';
      const outsideStaging = await request(app).get('/health/staging-seed');
      expect(outsideStaging.status).toBe(404);

      (env as any).APP_ENV = 'staging';
      const noKey = await request(app).get('/health/staging-seed');
      expect(noKey.status).toBe(403);

      const wrongKey = await request(app)
        .get('/health/staging-seed')
        .set('x-doctor-invitation-admin-key', 'wrong-admin-key');
      expect(wrongKey.status).toBe(403);
    } finally {
      (env as any).APP_ENV = prevAppEnv;
    }
  });
});
