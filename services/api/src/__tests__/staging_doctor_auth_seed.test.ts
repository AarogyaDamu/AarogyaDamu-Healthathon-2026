import bcrypt from 'bcryptjs';
import request from 'supertest';
import {
  ensureStagingDemoDoctor,
  DEMO_DOCTOR_EMAIL,
  DEMO_DOCTOR_NAME,
  DEMO_DOCTOR_FACILITY,
  DEMO_PATIENT_EMAIL,
  DEFAULT_DEMO_PASSWORD,
} from '../services/stagingDemoSeed';
import { app, prisma } from '../server';

describe('Staging Synthetic Demo Doctor Seed & Authentication Verification', () => {
  const doctorPassword = DEFAULT_DEMO_PASSWORD;
  let validPasswordHash: string;

  beforeAll(async () => {
    validPasswordHash = await bcrypt.hash(doctorPassword, 10);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // 1. Staging Seed Logic & Idempotency
  // =========================================================================
  describe('1. Staging Demo Seed Operation & Invariants', () => {
    test('creates demo doctor with synthetic flags and profile when missing', async () => {
      const createdUser: any = {
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

      const mockPrisma: any = {
        user: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            if (where.email === DEMO_DOCTOR_EMAIL) return Promise.resolve(null);
            if (where.email === DEMO_PATIENT_EMAIL) return Promise.resolve({ id: 'pat-1', email: DEMO_PATIENT_EMAIL });
            return Promise.resolve(null);
          }),
          create: jest.fn().mockResolvedValue(createdUser),
          update: jest.fn(),
        },
        doctorPatientAssignment: {
          findFirst: jest.fn().mockResolvedValue({ id: 'assign-1' }),
          create: jest.fn(),
        },
        patientProfile: {
          create: jest.fn(),
        },
      };

      const result = await ensureStagingDemoDoctor(mockPrisma);

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe('CREATED');
      expect(result.doctorEmail).toBe(DEMO_DOCTOR_EMAIL);
      expect(result.isClinician).toBe(true);
      expect(result.isActive).toBe(true);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: DEMO_DOCTOR_EMAIL,
            isSyntheticDemo: true,
            isClinician: true,
            isActive: true,
          }),
        }),
      );
    });

    test('idempotently updates credentials and flags if demo doctor exists but has stale password', async () => {
      const staleHash = await bcrypt.hash('OldStalePassword999!', 10);
      const existingUser: any = {
        id: 'doc-uuid-1',
        email: DEMO_DOCTOR_EMAIL,
        passwordHash: staleHash,
        isSyntheticDemo: true,
        isClinician: false, // stale flag
        isActive: false,    // stale flag
        profile: {
          fullName: DEMO_DOCTOR_NAME,
          primaryClinician: DEMO_DOCTOR_FACILITY,
        },
      };

      const updatedUser: any = {
        ...existingUser,
        passwordHash: validPasswordHash,
        isClinician: true,
        isActive: true,
      };

      const mockPrisma: any = {
        user: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            if (where.email === DEMO_DOCTOR_EMAIL) return Promise.resolve(existingUser);
            if (where.email === DEMO_PATIENT_EMAIL) return Promise.resolve({ id: 'pat-1', email: DEMO_PATIENT_EMAIL });
            return Promise.resolve(null);
          }),
          update: jest.fn().mockResolvedValue(updatedUser),
          create: jest.fn(),
        },
        doctorPatientAssignment: {
          findFirst: jest.fn().mockResolvedValue({ id: 'assign-1' }),
          create: jest.fn(),
        },
      };

      const result = await ensureStagingDemoDoctor(mockPrisma);

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe('UPDATED');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
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
  describe('2. Doctor Authentication Flow (POST /api/auth/login)', () => {
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

      // Verify Set-Cookie header contains refresh cookie
      const setCookies = res.headers['set-cookie'] || [];
      const cookieStr = Array.isArray(setCookies) ? setCookies.join('; ') : String(setCookies);
      expect(cookieStr).toContain('aarogyadamu_refresh_token');
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
        isActive: false, // Deactivated
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

