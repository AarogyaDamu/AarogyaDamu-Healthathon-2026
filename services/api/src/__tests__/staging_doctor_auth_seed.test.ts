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
  DEMO_PATIENT3_EMAIL,
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
    const defaultDoctor: any = {
      id: 'doc-uuid-1',
      email: DEMO_DOCTOR_EMAIL,
      passwordHash: validPasswordHash,
      isSyntheticDemo: true,
      isClinician: true,
      isActive: true,
      profile: {
        fullName: DEMO_DOCTOR_NAME,
        primaryClinician: DEMO_DOCTOR_FACILITY,
      },
    };

    const patient1: any = {
      id: 'pat-uuid-1',
      email: DEMO_PATIENT_EMAIL,
      passwordHash: validPasswordHash,
      isSyntheticDemo: true,
      isClinician: false,
      isActive: true,
      profile: {
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
        fullName: 'Suresh Patel',
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
        fullName: 'Sunita Sharma',
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
        fullName: DEMO_CAREGIVER_NAME,
      },
    };

    const mock: any = {
      featureFlag: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.email === DEMO_DOCTOR_EMAIL) return Promise.resolve(existingDoctor);
          if (where.email === DEMO_PATIENT_EMAIL) return Promise.resolve(patient1);
          if (where.email === DEMO_PATIENT2_EMAIL) return Promise.resolve(patient2);
          if (where.email === DEMO_PATIENT3_EMAIL) return Promise.resolve(patient3);
          if (where.email === DEMO_CAREGIVER_EMAIL) return Promise.resolve(caregiver);
          if (where.email === 'dr.kulkarni@aarogyadamu.local') return Promise.resolve(null);
          return Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          return Promise.resolve({
            id: `created-${data.email}`,
            ...data,
          });
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          return Promise.resolve({
            id: where.id,
            ...data,
          });
        }),
      },
      patientProfile: {
        create: jest.fn().mockResolvedValue({}),
      },
      doctorPatientAssignment: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      caregiverConsent: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      carePlan: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'careplan-uuid-1', title: 'Care Plan v1' }),
      },
      healthObservation: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      medicationSchedule: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve({
            id: `med-${where.medicineName}`,
            userId: where.userId,
            medicineName: where.medicineName,
          });
        }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'med-created-1', ...data })),
      },
      medicationAdherenceEvent: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      careTask: {
        upsert: jest.fn().mockResolvedValue({}),
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
        upsert: jest.fn().mockResolvedValue({}),
      },
      appointment: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      careTeamMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      careNotification: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 4 }),
      },
      lifestyleRecord: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      emergencyContact: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'ec-created-1' }),
      },
      reminder: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      agentAuditRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'seed-audit-sunita-proposal-1' }),
      },
      agentPlan: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'seed-plan-sunita-proposal-1' }),
      },
    };

    return { mock, defaultDoctor, patient1, patient2, patient3, caregiver };
  }

  // =========================================================================
  // 1. Staging Seed Logic & Idempotency
  // =========================================================================
  describe('1. Staging Demo Seed Operation & Clinical Dataset Invariants', () => {
    test('creates demo doctor, patients, caregiver, and full clinical dataset when missing', async () => {
      const { mock } = createComprehensiveMockPrisma(null);

      const result = await ensureStagingDemoDoctor(mock);

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe('CREATED');
      expect(result.doctorEmail).toBe(DEMO_DOCTOR_EMAIL);
      expect(result.isClinician).toBe(true);
      expect(result.isActive).toBe(true);
      expect(result.hasPatientLink).toBe(true);

      // Verify feature flags were upserted
      expect(mock.featureFlag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'P0_0_SAFETY_FOUNDATION' },
          create: expect.objectContaining({ isEnabled: true, rolloutTier: 'staging' }),
        }),
      );
      expect(mock.featureFlag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'P0_2_MEDICATION_VAULT' },
          create: expect.objectContaining({ isEnabled: true, rolloutTier: 'staging' }),
        }),
      );

      // Verify doctor was created
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

      // Verify assignments for 3 patients
      expect(mock.doctorPatientAssignment.upsert).toHaveBeenCalledTimes(3);

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

      // Verify CarePlan created
      expect(mock.carePlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: expect.stringContaining('Diabetes Glycemic Control Plan'),
            status: 'ACTIVE',
          }),
        }),
      );

      // Verify health observations upserted
      expect(mock.healthObservation.upsert).toHaveBeenCalled();

      // Verify statistics reported
      expect(result.stats).toBeDefined();
      expect(result.stats?.featureFlags).toBeGreaterThanOrEqual(9);
      expect(result.stats?.observations).toBeGreaterThanOrEqual(20);
      expect(result.stats?.assignments).toBe(3);
    });

    test('idempotently updates credentials and flags if demo doctor exists but has stale password', async () => {
      const staleHash = await bcrypt.hash('OldStalePassword999!', 10);
      const existingDoctor: any = {
        id: 'doc-uuid-1',
        email: DEMO_DOCTOR_EMAIL,
        passwordHash: staleHash,
        isSyntheticDemo: true,
        isClinician: false,
        isActive: false,
        profile: {
          fullName: DEMO_DOCTOR_NAME,
          primaryClinician: DEMO_DOCTOR_FACILITY,
        },
      };

      const { mock } = createComprehensiveMockPrisma(existingDoctor);

      const result = await ensureStagingDemoDoctor(mock);

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe('UPDATED');
      expect(mock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc-uuid-1' },
          data: expect.objectContaining({
            isSyntheticDemo: true,
            isClinician: true,
            isActive: true,
          }),
        }),
      );
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
