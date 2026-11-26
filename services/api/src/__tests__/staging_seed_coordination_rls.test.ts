import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../server';
import { withTenantTransaction } from '../db/tenantContext';
import {
  ensureStagingDemoDoctor,
  DEMO_DOCTOR_EMAIL,
  DEMO_PATIENT_EMAIL,
  DEMO_PATIENT2_EMAIL,
  DEMO_PATIENT3_EMAIL,
  DEMO_CAREGIVER_EMAIL,
  DEFAULT_DEMO_PASSWORD,
  SYNTHETIC_DEMO_BANNER,
} from '../services/stagingDemoSeed';
import { env } from '../config/env';

describe('Staging Synthetic Pilot Dataset, RLS Isolation & Cross-App Coordination (PostgreSQL 18)', () => {
  let appPrisma: PrismaClient;
  let adminPrisma: PrismaClient;

  const existingDoctorPassword = 'ExistingDoctorProvisioned2026!';
  const patientCompanionPassword = 'PatientCompanionStrong2026!';
  const patient2Password = 'PatientTwoStrongSecret2026!';
  const patient3Password = 'PatientThreeStrongSecret2026!';
  const caregiverPassword = 'CaregiverStrongSecret2026!';
  const unassignedDoctorPassword = 'UnassignedDocStrong2026!';
  const realUserEmail = `pranav.real.${Date.now()}@example.com`;
  const unassignedDocEmail = `dr.unassigned.${Date.now()}@aarogyadamu.local`;

  let realUser: any;
  let unassignedDoctor: any;
  let seededResult: any;

  let doctorToken: string;
  let patient1Token: string;
  let patient2Token: string;
  let patient3Token: string;
  let unassignedDocToken: string;
  let realUserToken: string;

  let patient1Id: string;
  let patient2Id: string;
  let patient3Id: string;

  function buildRoleDbUrl(rawUrl: string, targetDb: string, username?: string, password?: string) {
    const u = new URL(rawUrl);
    u.pathname = `/${targetDb}`;
    if (username !== undefined) u.username = username;
    if (password !== undefined) u.password = password;
    return u.toString();
  }

  async function loginAs(email: string, password: string) {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    return res.body;
  }

  beforeAll(async () => {
    const rawUrl =
      process.env.DATABASE_URL ||
      'postgresql://aarogyadamu:local-audit-password@127.0.0.1:55432/aarogyadamu_test?schema=public';
    const parsedRaw = new URL(rawUrl);
    const targetDb = parsedRaw.pathname.replace(/^\//, '').split('?')[0] || 'aarogyadamu_test';
    expect(targetDb).toBe('aarogyadamu_test');

    const appUrl = buildRoleDbUrl(
      rawUrl,
      targetDb,
      'aarogyadamu_app',
      process.env.APP_RUNTIME_DB_PASSWORD || 'AarogyaAppRuntime2026!',
    );
    const adminUrl = buildRoleDbUrl(
      process.env.ADMIN_DATABASE_URL?.trim() || rawUrl,
      targetDb,
    );

    appPrisma = new PrismaClient({ datasources: { db: { url: appUrl } } });
    adminPrisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });

    // Pre-provision:
    // 1. Existing doctor account (simulating pre-provisioned dr.rc@aarogyadamu.local in Neon)
    const docHash = await bcrypt.hash(existingDoctorPassword, 10);
    await adminPrisma.user.upsert({
      where: { email: DEMO_DOCTOR_EMAIL },
      create: {
        email: DEMO_DOCTOR_EMAIL,
        passwordHash: docHash,
        isClinician: true,
        isActive: true,
        isSyntheticDemo: true,
      },
      update: {
        passwordHash: docHash,
        isClinician: true,
        isActive: true,
        isSyntheticDemo: true,
      },
    });

    // 2. Real non-synthetic patient account (simulating real registered user that must NEVER be touched)
    const realHash = await bcrypt.hash('PranavRealAccount2026!', 10);
    realUser = await adminPrisma.user.create({
      data: {
        email: realUserEmail,
        passwordHash: realHash,
        isClinician: false,
        isActive: true,
        isSyntheticDemo: false,
        profile: {
          create: {
            fullName: 'Pranav Real User',
            diabetesType: 'TYPE_2_DIABETES',
          },
        },
      },
    });

    // 3. Unassigned second clinician
    const unDocHash = await bcrypt.hash(unassignedDoctorPassword, 10);
    unassignedDoctor = await adminPrisma.user.create({
      data: {
        email: unassignedDocEmail,
        passwordHash: unDocHash,
        isClinician: true,
        isActive: true,
        isSyntheticDemo: true,
        profile: {
          create: {
            fullName: 'Dr. Unassigned Clinician',
            diabetesType: 'UNKNOWN',
          },
        },
      },
    });
  });

  afterAll(async () => {
    await appPrisma?.$disconnect();
    await adminPrisma?.$disconnect();
  });

  test('01. Target database is isolated test DB and aarogyadamu_app is least-privilege (NOSUPERUSER, NOBYPASSRLS)', async () => {
    const rows = await appPrisma.$queryRawUnsafe<
      Array<{ db: string; role: string; rolsuper: boolean; rolbypassrls: boolean }>
    >(
      'SELECT current_database() AS db, current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    );
    expect(rows[0].db).toBe('aarogyadamu_test');
    expect(rows[0].role).toBe('aarogyadamu_app');
    expect(rows[0].rolsuper).toBe(false);
    expect(rows[0].rolbypassrls).toBe(false);

    // FeatureFlag must remain read-only to aarogyadamu_app
    await expect(
      appPrisma.featureFlag.upsert({
        where: { id: 'P0_7_AGENTIC_EXECUTION' },
        create: { id: 'P0_7_AGENTIC_EXECUTION', name: 'Blocked', isEnabled: true, rolloutTier: 'staging' },
        update: { isEnabled: true },
      }),
    ).rejects.toThrow(/42501|row-level security/i);
  });

  test('02. Environment and credential safety guards fail closed against production and shared/default secrets', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevProcessAppEnv = process.env.APP_ENV;
    const prevAppEnv = env.APP_ENV;
    const prevEndpoint = env.EXPECTED_NEON_ENDPOINT;

    // 2a. Strict refusal when APP_ENV === production
    process.env.APP_ENV = 'production';
    env.APP_ENV = 'production';
    try {
      const skipped = await ensureStagingDemoDoctor(appPrisma);
      expect(skipped.success).toBe(false);
      expect(skipped.actionTaken).toBe('SKIPPED_PRODUCTION');
    } finally {
      if (prevProcessAppEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevProcessAppEnv;
      env.APP_ENV = prevAppEnv;
    }

    // 2b. Strict refusal in production runtime without APP_ENV=staging
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'development';
    env.APP_ENV = 'development';
    try {
      await expect(
        ensureStagingDemoDoctor(appPrisma, { patientPassword: patientCompanionPassword }),
      ).rejects.toThrow(/requires APP_ENV=staging/i);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevProcessAppEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevProcessAppEnv;
      env.APP_ENV = prevAppEnv;
    }

    // 2c. Strict refusal of shared default password or missing companion password in deployed staging mode
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'staging';
    env.APP_ENV = 'staging';
    env.EXPECTED_NEON_ENDPOINT = 'ep-demo-pooler.ap-southeast-1.aws.neon.tech';
    try {
      await expect(
        ensureStagingDemoDoctor(appPrisma, {
          patientPassword: DEFAULT_DEMO_PASSWORD,
        }),
      ).rejects.toThrow(/non-default password/i);

      await expect(
        ensureStagingDemoDoctor(appPrisma, {
          doctorPassword: existingDoctorPassword,
          patientPassword: existingDoctorPassword,
        }),
      ).rejects.toThrow(/must not be shared/i);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevProcessAppEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevProcessAppEnv;
      env.APP_ENV = prevAppEnv;
      env.EXPECTED_NEON_ENDPOINT = prevEndpoint;
    }
  });

  test('03. Seeds complete coordinated 3-patient synthetic dataset strictly under aarogyadamu_app RLS and preserves existing doctor login', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevProcessAppEnv = process.env.APP_ENV;
    const prevAppEnv = env.APP_ENV;
    const prevEndpoint = env.EXPECTED_NEON_ENDPOINT;
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'staging';
    env.APP_ENV = 'staging';
    env.EXPECTED_NEON_ENDPOINT = 'ep-demo-pooler.ap-southeast-1.aws.neon.tech';

    try {
      seededResult = await ensureStagingDemoDoctor(appPrisma, {
        patientPassword: patientCompanionPassword,
        patient2Password,
        patient3Password,
        caregiverPassword,
      });

      expect(seededResult.success).toBe(true);
      expect(seededResult.doctorEmail).toBe(DEMO_DOCTOR_EMAIL);
      expect(seededResult.isClinician).toBe(true);
      expect(seededResult.isActive).toBe(true);
      expect(seededResult.hasPatientLink).toBe(true);
      expect(seededResult.syntheticPatients).toHaveLength(3);
      expect(seededResult.stats?.assignments).toBe(3);
      expect(seededResult.stats?.carePlans).toBe(3);
      expect(seededResult.stats?.medicationSchedules).toBeGreaterThanOrEqual(6);
      expect(seededResult.stats?.adherenceEvents).toBeGreaterThanOrEqual(24);
      expect(seededResult.stats?.careTasks).toBeGreaterThanOrEqual(10);
      expect(seededResult.stats?.journeyMilestones).toBeGreaterThanOrEqual(12);
      expect(seededResult.stats?.healthDocuments).toBeGreaterThanOrEqual(4);
      expect(seededResult.stats?.appointments).toBeGreaterThanOrEqual(6);
      expect(seededResult.stats?.consultationNotes).toBeGreaterThanOrEqual(3);
      expect(seededResult.stats?.auditEvents).toBe(3);
      expect(seededResult.featureFlagsSummary?.agenticFlagsDisabled).toBe(true);

      // Idempotent second run under restricted aarogyadamu_app role (must not fail on immutable ConsultationNote/Adherence/Document)
      const secondRun = await ensureStagingDemoDoctor(appPrisma, {
        patientPassword: patientCompanionPassword,
        patient2Password,
        patient3Password,
        caregiverPassword,
      });
      expect(secondRun.success).toBe(true);
      expect(secondRun.actionTaken).toBe('ALREADY_VALID');
      expect(secondRun.stats?.assignments).toBe(3);

      // Ensure zero secrets, JWTs, refresh tokens, or DB URLs leaked in seed result
      const serialized = JSON.stringify(seededResult);
      expect(serialized).not.toContain(patientCompanionPassword);
      expect(serialized).not.toContain(existingDoctorPassword);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('postgres://');

      // Existing doctor's original provisioned password was preserved!
      const docRecord = await adminPrisma.user.findUnique({ where: { email: DEMO_DOCTOR_EMAIL } });
      expect(docRecord).not.toBeNull();
      expect(await bcrypt.compare(existingDoctorPassword, docRecord!.passwordHash)).toBe(true);

      patient1Id = seededResult.syntheticPatients[0].id;
      patient2Id = seededResult.syntheticPatients[1].id;
      patient3Id = seededResult.syntheticPatients[2].id;
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevProcessAppEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevProcessAppEnv;
      env.APP_ENV = prevAppEnv;
      env.EXPECTED_NEON_ENDPOINT = prevEndpoint;
    }
  });

  test('04. Real user account (Pranav) remains completely untouched and STAGING_BOOTSTRAP_WORKER cannot mark real accounts synthetic', async () => {
    const refreshedReal = await adminPrisma.user.findUnique({ where: { id: realUser.id } });
    expect(refreshedReal?.isSyntheticDemo).toBe(false);

    const realAssignments = await adminPrisma.doctorPatientAssignment.count({
      where: { patientId: realUser.id },
    });
    expect(realAssignments).toBe(0);

    // Column guard trigger enforces domain allowlist even for STAGING_BOOTSTRAP_WORKER
    await expect(
      withTenantTransaction(
        appPrisma,
        { isSystemWorker: true, workerScope: 'STAGING_BOOTSTRAP_WORKER' },
        async (tx) =>
          tx.user.update({
            where: { id: realUser.id },
            data: { isSyntheticDemo: true },
          }),
      ),
    ).rejects.toThrow(/cannot mark non-approved account as synthetic|42501/i);
  });

  test('05. Cross-App Step 1-5: Synthetic patient & Doctor authenticate and view matching backend-persisted data & filters', async () => {
    const p1Login = await loginAs(DEMO_PATIENT_EMAIL, patientCompanionPassword);
    patient1Token = p1Login.token;
    expect(p1Login.user.isSyntheticDemo).toBe(true);
    expect(p1Login.user.isClinician).toBe(false);

    const p2Login = await loginAs(DEMO_PATIENT2_EMAIL, patient2Password);
    patient2Token = p2Login.token;
    const p3Login = await loginAs(DEMO_PATIENT3_EMAIL, patient3Password);
    patient3Token = p3Login.token;

    const docLogin = await loginAs(DEMO_DOCTOR_EMAIL, existingDoctorPassword);
    doctorToken = docLogin.token;
    expect(docLogin.user.isClinician).toBe(true);

    const unDocLogin = await loginAs(unassignedDocEmail, unassignedDoctorPassword);
    unassignedDocToken = unDocLogin.token;
    const realLogin = await loginAs(realUserEmail, 'PranavRealAccount2026!');
    realUserToken = realLogin.token;

    // Patient 1 reads own records from hosted PostgreSQL API
    const [p1Obs, p1Meds, p1Plan, p1Tasks, p1Milestones, p1Twin, p1Docs, p1Appts, p1Notifs, p1Emerg] =
      await Promise.all([
        request(app).get('/api/observations').set('Authorization', `Bearer ${patient1Token}`),
        request(app).get('/api/medications').set('Authorization', `Bearer ${patient1Token}`),
        request(app).get(`/api/care-plans/patient/${patient1Id}/active`).set('Authorization', `Bearer ${patient1Token}`),
        request(app).get('/api/tasks').set('Authorization', `Bearer ${patient1Token}`),
        request(app).get('/api/journey/milestones').set('Authorization', `Bearer ${patient1Token}`),
        request(app).get('/api/health-twin').set('Authorization', `Bearer ${patient1Token}`),
        request(app).get('/api/documents').set('Authorization', `Bearer ${patient1Token}`),
        request(app).get('/api/coordination/appointments').set('Authorization', `Bearer ${patient1Token}`),
        request(app).get('/api/coordination/notifications').set('Authorization', `Bearer ${patient1Token}`),
        request(app).get('/api/emergency/contacts').set('Authorization', `Bearer ${patient1Token}`),
      ]);

    expect(p1Obs.status).toBe(200);
    expect(p1Obs.body.observations.length).toBeGreaterThanOrEqual(15);
    expect(JSON.stringify(p1Obs.body.observations)).toContain(SYNTHETIC_DEMO_BANNER);

    expect(p1Meds.status).toBe(200);
    expect(p1Meds.body.medications.length).toBeGreaterThanOrEqual(2);

    expect(p1Plan.status).toBe(200);
    expect(p1Plan.body.carePlan.status).toBe('ACTIVE');

    expect(p1Tasks.status).toBe(200);
    expect(p1Tasks.body.tasks.length).toBeGreaterThanOrEqual(4);

    expect(p1Milestones.status).toBe(200);
    expect(p1Milestones.body.milestones.length).toBeGreaterThanOrEqual(4);

    expect(p1Twin.status).toBe(200);
    expect(p1Twin.body.governance.isReadOnly).toBe(true);
    expect(p1Twin.body.metrics.vitals.hasData).toBe(true);

    expect(p1Docs.status).toBe(200);
    expect(p1Docs.body.documents.length).toBeGreaterThanOrEqual(2);

    expect(p1Appts.status).toBe(200);
    expect(p1Appts.body.appointments.length).toBeGreaterThanOrEqual(2);

    expect(p1Notifs.status).toBe(200);
    expect(p1Emerg.status).toBe(200);
    expect(p1Emerg.body.contacts.length).toBeGreaterThanOrEqual(1);

    // Doctor dashboard shows all 3 assigned synthetic patients & working search / risk filters
    const dashAll = await request(app)
      .get('/api/coordination/doctor/dashboard')
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(dashAll.status).toBe(200);
    expect(dashAll.body.summary.totalAssignedPatients).toBe(3);
    expect(dashAll.body.summary.highRiskCount).toBe(2);
    expect(dashAll.body.summary.upcomingAppointmentsCount).toBeGreaterThanOrEqual(3);
    expect(dashAll.body.patients.map((p: any) => p.email).sort()).toEqual(
      [DEMO_PATIENT_EMAIL, DEMO_PATIENT2_EMAIL, DEMO_PATIENT3_EMAIL].sort(),
    );

    const dashSearchB = await request(app)
      .get('/api/coordination/doctor/dashboard?search=Suresh')
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(dashSearchB.status).toBe(200);
    expect(dashSearchB.body.patients).toHaveLength(1);
    expect(dashSearchB.body.patients[0].email).toBe(DEMO_PATIENT2_EMAIL);

    const dashHighRisk = await request(app)
      .get('/api/coordination/doctor/dashboard?risk=HIGH')
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(dashHighRisk.status).toBe(200);
    expect(dashHighRisk.body.patients.length).toBe(2);

    const dashInTarget = await request(app)
      .get('/api/coordination/doctor/dashboard?risk=IN_TARGET')
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(dashInTarget.status).toBe(200);
    expect(dashInTarget.body.patients).toHaveLength(1);
    expect(dashInTarget.body.patients[0].email).toBe(DEMO_PATIENT_EMAIL);

    // Doctor and Patient observe exact matching glucose observations from PostgreSQL
    const docP1Obs = await request(app)
      .get('/api/observations')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('X-Target-Patient-Id', patient1Id);
    expect(docP1Obs.status).toBe(200);
    expect(docP1Obs.body.observations.map((o: any) => o.id)).toEqual(
      p1Obs.body.observations.map((o: any) => o.id),
    );
  });

  test('06. Cross-App Step 6-8: Doctor reviews clinical records & Patient sees updates; Patient updates persist & appear for Doctor', async () => {
    // Doctor reviews Patient B's self-reported UNREVIEWED medication
    const docP2Meds = await request(app)
      .get('/api/medications?status=ALL')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('X-Target-Patient-Id', patient2Id);
    expect(docP2Meds.status).toBe(200);
    const unreviewedMed = docP2Meds.body.medications.find((m: any) => m.reviewStatus === 'UNREVIEWED');
    expect(unreviewedMed).toBeDefined();

    const medReviewRes = await request(app)
      .post(`/api/medications/${unreviewedMed.id}/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        clinicalReviewNotes: `Verified in synthetic demo reconciliation (${SYNTHETIC_DEMO_BANNER}).`,
        dosage: '10mg',
        status: 'ACTIVE',
      });
    expect(medReviewRes.status).toBe(200);
    expect(medReviewRes.body.medication.reviewStatus).toBe('CLINICIAN_REVIEWED');

    // Patient 2 sees clinician-reviewed status from PostgreSQL
    const p2MedsAfter = await request(app)
      .get('/api/medications?status=ALL')
      .set('Authorization', `Bearer ${patient2Token}`);
    const reconciled = p2MedsAfter.body.medications.find((m: any) => m.id === unreviewedMed.id);
    expect(reconciled.reviewStatus).toBe('CLINICIAN_REVIEWED');

    // Doctor reviews Patient A's pending synthetic medical report metadata
    const docP1Docs = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('X-Target-Patient-Id', patient1Id);
    const pendingDoc = docP1Docs.body.documents.find((d: any) =>
      d.title.includes('Pre-Visit Metabolic Summary Sheet'),
    );
    expect(pendingDoc).toBeDefined();

    const docReviewRes = await request(app)
      .post(`/api/documents/${pendingDoc.id}/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        reviewStatus: 'REVIEWED',
        clinicalNotes: `Metadata reviewed cleanly without file blob (${SYNTHETIC_DEMO_BANNER}).`,
        commitToTimeline: false,
      });
    expect(docReviewRes.status).toBe(200);

    // Patient 1 sees updated doctorReviewStatus on GET /api/documents
    const p1DocsAfter = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${patient1Token}`);
    const p1ReviewedDoc = p1DocsAfter.body.documents.find((d: any) => d.id === pendingDoc.id);
    const extractedObj =
      typeof p1ReviewedDoc.extractedData === 'string'
        ? JSON.parse(p1ReviewedDoc.extractedData)
        : p1ReviewedDoc.extractedData;
    expect(extractedObj.doctorReviewStatus).toBe('REVIEWED');

    // Doctor confirms Patient C's requested appointment
    const docP3Appts = await request(app)
      .get('/api/coordination/appointments')
      .set('Authorization', `Bearer ${doctorToken}`);
    const requestedP3Appt = docP3Appts.body.appointments.find(
      (a: any) => a.patientId === patient3Id && a.status === 'REQUESTED',
    );
    expect(requestedP3Appt).toBeDefined();

    const confirmRes = await request(app)
      .patch(`/api/coordination/appointments/${requestedP3Appt.id}/status`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ status: 'CONFIRMED' });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.appointment.status).toBe('CONFIRMED');

    const p3ApptsAfter = await request(app)
      .get('/api/coordination/appointments')
      .set('Authorization', `Bearer ${patient3Token}`);
    expect(
      p3ApptsAfter.body.appointments.some(
        (a: any) => a.id === requestedP3Appt.id && a.status === 'CONFIRMED',
      ),
    ).toBe(true);

    // Patient 1 logs a permitted glucose observation -> Doctor immediately observes it in PostgreSQL
    const createObsRes = await request(app)
      .post('/api/observations')
      .set('Authorization', `Bearer ${patient1Token}`)
      .send({
        type: 'BLOOD_GLUCOSE',
        numericValue: 115,
        unit: 'mg/dL',
        context: 'FASTING',
        notes: `Patient self-logged coordinated check (${SYNTHETIC_DEMO_BANNER})`,
      });
    expect(createObsRes.status).toBe(201);

    // Patient 1 logs a permitted medication adherence event -> Doctor sees it on adherence stats/events
    const p1MedsForEvent = await request(app)
      .get('/api/medications')
      .set('Authorization', `Bearer ${patient1Token}`);
    expect(p1MedsForEvent.status).toBe(200);
    const p1MedId = p1MedsForEvent.body.medications[0].id;
    const logAdhRes = await request(app)
      .post(`/api/medications/${p1MedId}/events`)
      .set('Authorization', `Bearer ${patient1Token}`)
      .send({
        action: 'TAKEN',
        scheduledTime: new Date().toISOString(),
        notes: `Coordinated patient dose log (${SYNTHETIC_DEMO_BANNER})`,
      });
    expect(logAdhRes.status).toBe(201);

    const [docSeesNewObs, docSeesNewAdh] = await Promise.all([
      request(app)
        .get('/api/observations')
        .set('Authorization', `Bearer ${doctorToken}`)
        .set('X-Target-Patient-Id', patient1Id),
      request(app)
        .get(`/api/medications/${p1MedId}/events`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .set('X-Target-Patient-Id', patient1Id),
    ]);
    expect(
      docSeesNewObs.body.observations.some((o: any) => o.id === createObsRes.body.observation.id && o.numericValue === 115),
    ).toBe(true);
    expect(
      docSeesNewAdh.body.events.some((e: any) => e.id === logAdhRes.body.event.id && e.action === 'TAKEN'),
    ).toBe(true);
  });

  test('07. Cross-App Step 9-11: Unassigned doctor, cross-patient access denied (403) and AuditLog recorded', async () => {
    // Unassigned doctor sees 0 patients on dashboard
    const unDocDash = await request(app)
      .get('/api/coordination/doctor/dashboard')
      .set('Authorization', `Bearer ${unassignedDocToken}`);
    expect(unDocDash.status).toBe(200);
    expect(unDocDash.body.patients).toHaveLength(0);

    // Unassigned doctor denied (403) on patient records
    const [unDocObs, unDocMeds, unDocDocs, unDocTwin] = await Promise.all([
      request(app)
        .get('/api/observations')
        .set('Authorization', `Bearer ${unassignedDocToken}`)
        .set('X-Target-Patient-Id', patient1Id),
      request(app)
        .get('/api/medications')
        .set('Authorization', `Bearer ${unassignedDocToken}`)
        .set('X-Target-Patient-Id', patient1Id),
      request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${unassignedDocToken}`)
        .set('X-Target-Patient-Id', patient1Id),
      request(app)
        .get('/api/health-twin')
        .set('Authorization', `Bearer ${unassignedDocToken}`)
        .set('X-Target-Patient-Id', patient1Id),
    ]);
    expect(unDocObs.status).toBe(403);
    expect(unDocMeds.status).toBe(403);
    expect(unDocDocs.status).toBe(403);
    expect(unDocTwin.status).toBe(403);

    // Assigned doctor denied (403) trying to read real unassigned user (Pranav)
    const docRealUserRes = await request(app)
      .get('/api/observations')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('X-Target-Patient-Id', realUser.id);
    expect(docRealUserRes.status).toBe(403);

    // Cross-patient access denied (Patient 2 or Real user trying to access Patient 1)
    const [p2ReadsP1Obs, p2ReadsP1Plan, realReadsP1Docs] = await Promise.all([
      request(app)
        .get('/api/observations')
        .set('Authorization', `Bearer ${patient2Token}`)
        .set('X-Target-Patient-Id', patient1Id),
      request(app)
        .get(`/api/care-plans/patient/${patient1Id}/active`)
        .set('Authorization', `Bearer ${patient2Token}`),
      request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${realUserToken}`)
        .set('X-Target-Patient-Id', patient1Id),
    ]);
    expect(p2ReadsP1Obs.status).toBe(403);
    expect(p2ReadsP1Plan.status).toBe(403);
    expect(realReadsP1Docs.status).toBe(403);

    // Verify AuditLog events persisted in PostgreSQL
    const auditActions = await adminPrisma.auditLog.findMany({
      where: {
        action: {
          in: ['STAGING_SYNTHETIC_PILOT_SEEDED', 'MEDICATION_REVIEWED', 'DOCUMENT_REVIEWED'],
        },
      },
      select: { action: true, userId: true },
    });
    expect(auditActions.some((a) => a.action === 'STAGING_SYNTHETIC_PILOT_SEEDED' && a.userId === patient1Id)).toBe(true);
    expect(auditActions.some((a) => a.action === 'MEDICATION_REVIEWED' && a.userId === patient2Id)).toBe(true);

    // Verify /health/staging-seed POST works cleanly in staging mode with valid key and never leaks secrets
    const prevProcessAppEnv = process.env.APP_ENV;
    const prevAppEnv = env.APP_ENV;
    const prevEndpoint = env.EXPECTED_NEON_ENDPOINT;
    process.env.APP_ENV = 'staging';
    env.APP_ENV = 'staging';
    env.EXPECTED_NEON_ENDPOINT = 'ep-demo-pooler.ap-southeast-1.aws.neon.tech';
    try {
      const seedEndpointRes = await request(app)
        .post('/health/staging-seed')
        .set('x-doctor-invitation-admin-key', process.env.DOCTOR_INVITATION_ADMIN_KEY || '')
        .send({ patientPassword: patientCompanionPassword });
      expect(seedEndpointRes.status).toBe(200);
      expect(seedEndpointRes.body.success).toBe(true);
      expect(JSON.stringify(seedEndpointRes.body)).not.toContain(patientCompanionPassword);
    } finally {
      if (prevProcessAppEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevProcessAppEnv;
      env.APP_ENV = prevAppEnv;
      env.EXPECTED_NEON_ENDPOINT = prevEndpoint;
    }
  });
});
