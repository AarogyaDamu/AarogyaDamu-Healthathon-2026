import bcrypt from 'bcryptjs';
import request from 'supertest';
import {
  ensureStagingDemoDoctor,
  DEMO_DOCTOR_EMAIL,
  DEMO_DOCTOR_NAME,
  DEMO_DOCTOR_FACILITY,
  DEMO_PATIENT_EMAIL,
  DEMO_PATIENT_NAME,
  DEMO_PATIENT2_EMAIL,
  DEMO_PATIENT2_NAME,
  DEMO_PATIENT3_EMAIL,
  DEMO_PATIENT3_NAME,
  DEMO_CAREGIVER_EMAIL,
  DEMO_CAREGIVER_NAME,
  DEFAULT_DEMO_PASSWORD,
} from '../services/stagingDemoSeed';
import { app, prisma } from '../server';

describe('Staging Synthetic Demo Clinical Data Seed & Authentication Verification', () => {
  const demoPassword = DEFAULT_DEMO_PASSWORD;
  let validPasswordHash: string;

  beforeAll(async () => {
    validPasswordHash = await bcrypt.hash(demoPassword, 10);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  function createComprehensiveMockPrisma(existingDoctor: any = null) {
    const patient1: any = {
      id: 'pat-uuid-1',
      email: DEMO_PATIENT_EMAIL,
      passwordHash: validPasswordHash,
      isSyntheticDemo: true,
      isClinician: false,
      isActive: true,
      profile: {
        userId: 'pat-uuid-1',
        fullName: DEMO_PATIENT_NAME,
      },
    };

    const patient2: any = {
      id: 'pat-uuid-2',
      email: DEMO_PATIENT2_EMAIL,
      passwordHash: validPasswordHash,
      isSyntheticDemo: true,
      isClinician: false,
      isActive: true,
      profile: {
        userId: 'pat-uuid-2',
        fullName: DEMO_PATIENT2_NAME,
      },
    };

    const patient3: any = {
      id: 'pat-uuid-3',
      email: DEMO_PATIENT3_EMAIL,
      passwordHash: validPasswordHash,
      isSyntheticDemo: true,
      isClinician: false,
      isActive: true,
      profile: {
        userId: 'pat-uuid-3',
        fullName: DEMO_PATIENT3_NAME,
      },
    };

    const caregiver: any = {
      id: 'cg-uuid-1',
      email: DEMO_CAREGIVER_EMAIL,
      passwordHash: validPasswordHash,
      isSyntheticDemo: true,
      isClinician: false,
      isActive: true,
      profile: {
        userId: 'cg-uuid-1',
        fullName: DEMO_CAREGIVER_NAME,
      },
    };

    const userMap = new Map<string, any>();
    if (existingDoctor) userMap.set(DEMO_DOCTOR_EMAIL, existingDoctor);
    userMap.set(DEMO_PATIENT_EMAIL, patient1);
    userMap.set(DEMO_PATIENT2_EMAIL, patient2);
    userMap.set(DEMO_PATIENT3_EMAIL, patient3);
    userMap.set(DEMO_CAREGIVER_EMAIL, caregiver);

    const mock: any = {
      featureFlag: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'P0_0_SAFETY_FOUNDATION', isEnabled: true },
          { id: 'P0_1_HEALTH_JOURNAL', isEnabled: true },
          { id: 'P0_2_MEDICATION_VAULT', isEnabled: true },
          { id: 'P0_3_LIFESTYLE_TWIN', isEnabled: true },
          { id: 'P0_4_NOTIFICATIONS_SOS', isEnabled: true },
          { id: 'P0_7_AGENTIC_EXECUTION', isEnabled: false },
          { id: 'P0_8_EXTERNAL_INTEGRATIONS', isEnabled: false },
        ]),
        upsert: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.email) return Promise.resolve(userMap.get(where.email) || null);
          return Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const created = {
            id: `created-${data.email}`,
            ...data,
          };
          userMap.set(data.email, created);
          return Promise.resolve(created);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          return Promise.resolve({
            id: where.id,
            email: existingDoctor?.id === where.id ? DEMO_DOCTOR_EMAIL : DEMO_PATIENT_EMAIL,
            ...data,
          });
        }),
      },
      patientProfile: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const found = Array.from(userMap.values()).find((u) => u.id === where.userId);
          return Promise.resolve(found?.profile || null);
        }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `prof-${data.userId}`, ...data })),
      },
      practice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'practice-uuid-1',
          name: 'AarogyaDamu Diabetes Care & Research Center',
        }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'practice-created-1', ...data })),
      },
      practiceMembership: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      doctorPatientAssignment: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      caregiverConsent: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      carePlan: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: `careplan-${data.patientId}`, title: data.title, version: data.version, approvedAt: new Date() }),
        ),
      },
      healthObservation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `obs-${data.idempotencyKey}`, ...data })),
      },
      medicationSchedule: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `med-${data.userId}-${data.medicineName}`, ...data })),
      },
      medicationAdherenceEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `adh-${data.idempotencyKey}`, ...data })),
      },
      careTask: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `task-${data.idempotencyKey}`, ...data })),
      },
      journeyMilestone: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `jm-${data.milestoneKey}`, ...data })),
      },
      healthDocument: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'doc-created-1' }),
      },
      consultationPrep: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'prep-created-1' }),
      },
      consultationNote: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `cnote-${data.idempotencyKey}`, ...data })),
      },
      appointment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'appt-created-1' }),
      },
      careTeamMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'msg-created-1' }),
      },
      careNotification: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'notif-created-1' }),
      },
      lifestyleRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'life-created-1' }),
      },
      emergencyContact: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'ec-created-1' }),
      },
      reminder: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'rem-created-1' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-created-1' }),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ xid: '100', pid: 1, db: 'aarogyadamu_test', role: 'aarogyadamu_app', rolsuper: false, rolbypassrls: false }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(mock)),
    };

    return { mock, patient1, patient2, patient3, caregiver };
  }

  // =========================================================================
  // 1. Staging Seed Logic & Read-Only FeatureFlag Compliance
  // =========================================================================
  describe('1. Staging Demo Seed Operation & Clinical Dataset Invariants', () => {
    test('creates demo doctor, 3 synthetic patients, caregiver, and complete clinical datasets without mutating FeatureFlag', async () => {
      const { mock } = createComprehensiveMockPrisma(null);

      const result = await ensureStagingDemoDoctor(mock);

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe('CREATED');
      expect(result.doctorEmail).toBe(DEMO_DOCTOR_EMAIL);
      expect(result.isClinician).toBe(true);
      expect(result.isActive).toBe(true);
      expect(result.hasPatientLink).toBe(true);
      expect(result.syntheticPatients).toHaveLength(3);

      // Verify FeatureFlag was ONLY read, never written (runtime role lacks FeatureFlag writes)
      expect(mock.featureFlag.findMany).toHaveBeenCalled();
      expect(mock.featureFlag.upsert).not.toHaveBeenCalled();
      expect(result.featureFlagsSummary?.agenticFlagsDisabled).toBe(true);

      // Verify doctor was created without nested PatientProfile (separate profile write for RLS compatibility)
      expect(mock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: DEMO_DOCTOR_EMAIL,
            isSyntheticDemo: true,
            isClinician: true,
            isActive: true,
          }),
        }),
      );
      expect(mock.patientProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fullName: DEMO_DOCTOR_NAME,
            primaryClinician: DEMO_DOCTOR_FACILITY,
          }),
        }),
      );

      // Verify assignments & CarePlans for all 3 synthetic patients
      expect(mock.doctorPatientAssignment.upsert).toHaveBeenCalledTimes(3);
      expect(mock.carePlan.create).toHaveBeenCalledTimes(3);

      // Verify caregiver consent
      expect(mock.caregiverConsent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ activeGrantKey: expect.any(String) }),
          create: expect.objectContaining({
            status: 'ACTIVE',
            caregiverEmail: DEMO_CAREGIVER_EMAIL,
          }),
        }),
      );

      // Verify health observations & audit events recorded across all 3 patients
      expect(mock.healthObservation.create).toHaveBeenCalled();
      expect(mock.auditLog.create).toHaveBeenCalledTimes(3);
      expect(result.stats).toBeDefined();
      expect(result.stats?.featureFlagsMutated).toBe(0);
      expect(result.stats?.observations).toBeGreaterThanOrEqual(40);
      expect(result.stats?.assignments).toBe(3);
      expect(result.stats?.carePlans).toBe(3);
      expect(result.stats?.auditEvents).toBe(3);
    });

    test('repairs active clinician flags on existing doctor without clobbering existing password hash in production staging', async () => {
      const existingHash = await bcrypt.hash('OperatorProvisionedDoctorSecret99!', 10);
      const existingDoctor: any = {
        id: 'doc-uuid-1',
        email: DEMO_DOCTOR_EMAIL,
        passwordHash: existingHash,
        isSyntheticDemo: true,
        isClinician: false,
        isActive: false,
        profile: {
          userId: 'doc-uuid-1',
          fullName: DEMO_DOCTOR_NAME,
          primaryClinician: DEMO_DOCTOR_FACILITY,
        },
      };

      const { mock } = createComprehensiveMockPrisma(existingDoctor);

      const prevNodeEnv = process.env.NODE_ENV;
      const prevProcessAppEnv = process.env.APP_ENV;
      const { env } = require('../config/env');
      const prevAppEnv = env.APP_ENV;
      const prevEndpoint = env.EXPECTED_NEON_ENDPOINT;
      process.env.NODE_ENV = 'production';
      process.env.APP_ENV = 'staging';
      env.APP_ENV = 'staging';
      env.EXPECTED_NEON_ENDPOINT = 'ep-demo-pooler.ap-southeast-1.aws.neon.tech';

      try {
        const result = await ensureStagingDemoDoctor(mock, {
          patientPassword: 'PatientCompanionStrongSecret2026!',
        });

        expect(result.success).toBe(true);
        expect(result.actionTaken).toBe('UPDATED');
        expect(mock.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'doc-uuid-1' },
            data: expect.not.objectContaining({
              passwordHash: expect.anything(),
            }),
          }),
        );
      } finally {
        process.env.NODE_ENV = prevNodeEnv;
        if (prevProcessAppEnv === undefined) delete process.env.APP_ENV;
        else process.env.APP_ENV = prevProcessAppEnv;
        env.APP_ENV = prevAppEnv;
        env.EXPECTED_NEON_ENDPOINT = prevEndpoint;
      }
    });

    test('refuses weak default password in production staging', async () => {
      const { mock } = createComprehensiveMockPrisma(null);
      const prevNodeEnv = process.env.NODE_ENV;
      const prevProcessAppEnv = process.env.APP_ENV;
      const { env } = require('../config/env');
      const prevAppEnv = env.APP_ENV;
      const prevEndpoint = env.EXPECTED_NEON_ENDPOINT;
      process.env.NODE_ENV = 'production';
      process.env.APP_ENV = 'staging';
      env.APP_ENV = 'staging';
      env.EXPECTED_NEON_ENDPOINT = 'ep-demo-pooler.ap-southeast-1.aws.neon.tech';

      try {
        await expect(
          ensureStagingDemoDoctor(mock, {
            doctorPassword: DEFAULT_DEMO_PASSWORD,
            patientPassword: 'AnotherStrongPassword2026!',
          }),
        ).rejects.toThrow(/non-default password/i);
      } finally {
        process.env.NODE_ENV = prevNodeEnv;
        if (prevProcessAppEnv === undefined) delete process.env.APP_ENV;
        else process.env.APP_ENV = prevProcessAppEnv;
        env.APP_ENV = prevAppEnv;
        env.EXPECTED_NEON_ENDPOINT = prevEndpoint;
      }
    });
  });

  // =========================================================================
  // 2. Authentication Endpoint (POST /api/auth/login)
  // =========================================================================
  describe('2. Authentication Flow for Doctor, Patient, and Caregiver', () => {
    test('succeeds for valid demo doctor credentials and returns clinician session', async () => {
      const mockDoctor = {
        id: 'doctor-uuid-1234',
        email: DEMO_DOCTOR_EMAIL,
        passwordHash: validPasswordHash,
        isSyntheticDemo: true,
        isClinician: true,
        isActive: true,
        profile: {
          id: 'profile-uuid-1',
          fullName: DEMO_DOCTOR_NAME,
          primaryClinician: DEMO_DOCTOR_FACILITY,
        },
      };

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockDoctor as any);
      jest.spyOn(prisma.patientProfile, 'findUnique').mockResolvedValue(mockDoctor.profile as any);
      jest.spyOn(prisma.authSession, 'create').mockResolvedValue({
        id: 'session-uuid-1',
        userId: mockDoctor.id,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      } as any);
      jest.spyOn(prisma.refreshToken, 'create').mockResolvedValue({} as any);
      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: DEMO_DOCTOR_EMAIL,
          password: DEFAULT_DEMO_PASSWORD,
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user).toEqual({
        id: mockDoctor.id,
        email: DEMO_DOCTOR_EMAIL,
        isSyntheticDemo: true,
        isClinician: true,
      });
      expect(res.body.profile.fullName).toBe(DEMO_DOCTOR_NAME);

      const setCookies = res.headers['set-cookie'] || [];
      const cookieStr = Array.isArray(setCookies) ? setCookies.join('; ') : String(setCookies);
      expect(cookieStr).toContain('aarogyadamu_refresh_token');
    });

    test('succeeds for valid demo patient credentials', async () => {
      const mockPatient = {
        id: 'patient-uuid-1234',
        email: DEMO_PATIENT_EMAIL,
        passwordHash: validPasswordHash,
        isSyntheticDemo: true,
        isClinician: false,
        isActive: true,
        profile: {
          id: 'profile-uuid-patient',
          fullName: DEMO_PATIENT_NAME,
        },
      };

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockPatient as any);
      jest.spyOn(prisma.patientProfile, 'findUnique').mockResolvedValue(mockPatient.profile as any);
      jest.spyOn(prisma.authSession, 'create').mockResolvedValue({
        id: 'session-uuid-patient',
        userId: mockPatient.id,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      } as any);
      jest.spyOn(prisma.refreshToken, 'create').mockResolvedValue({} as any);
      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: DEMO_PATIENT_EMAIL,
          password: DEFAULT_DEMO_PASSWORD,
        });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(DEMO_PATIENT_EMAIL);
      expect(res.body.user.isClinician).toBe(false);
      expect(res.body.profile.fullName).toBe(DEMO_PATIENT_NAME);
    });

    test('strictly returns 401 Unauthorized when wrong password is provided', async () => {
      const mockDoctor = {
        id: 'doctor-uuid-1234',
        email: DEMO_DOCTOR_EMAIL,
        passwordHash: validPasswordHash,
        isSyntheticDemo: true,
        isClinician: true,
        isActive: true,
        profile: {
          id: 'profile-uuid-1',
          fullName: DEMO_DOCTOR_NAME,
        },
      };

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockDoctor as any);
      jest.spyOn(prisma.patientProfile, 'findUnique').mockResolvedValue(mockDoctor.profile as any);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: DEMO_DOCTOR_EMAIL,
          password: 'IncorrectPassword999!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    test('strictly returns 401 Unauthorized when account does not exist in database', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: DEMO_DOCTOR_EMAIL,
          password: DEFAULT_DEMO_PASSWORD,
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    test('strictly returns 403 Forbidden when account is deactivated (isActive: false)', async () => {
      const deactivatedDoctor = {
        id: 'doctor-uuid-1234',
        email: DEMO_DOCTOR_EMAIL,
        passwordHash: validPasswordHash,
        isSyntheticDemo: true,
        isClinician: true,
        isActive: false,
        profile: null,
      };

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(deactivatedDoctor as any);
      jest.spyOn(prisma.securityAuditEvent, 'create').mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: DEMO_DOCTOR_EMAIL,
          password: DEFAULT_DEMO_PASSWORD,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/deactivated/i);
    });
  });
});
