import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { withTenantTransaction } from '../db/tenantContext';

describe('Group A RLS Security Regression Suite (PostgreSQL 18 & aarogyadamu_app)', () => {
  let appPrisma: PrismaClient;
  let adminPrisma: PrismaClient;

  let doctor: any;
  let patient1: any;
  let patient2: any;
  let caregiverUser: any;
  let pilotPatient: any;
  let nurse: any;

  beforeAll(async () => {
    const rawUrl = process.env.DATABASE_URL || 'postgresql://aarogyadamu_app:AarogyaAppRuntime2026!@127.0.0.1:55432/aarogyadamu_test?schema=public';
    const targetDb = rawUrl.includes('rls_demo') ? 'aarogyadamu_rls_demo' : 'aarogyadamu_test';

    function setDbAndAuth(url: string, db: string, username?: string, password?: string) {
      try {
        const u = new URL(url);
        u.pathname = '/' + db;
        if (username !== undefined) u.username = username;
        if (password !== undefined) u.password = password;
        return u.toString();
      } catch {
        return url;
      }
    }

    const appUrl = setDbAndAuth(rawUrl, targetDb, 'aarogyadamu_app', process.env.APP_RUNTIME_DB_PASSWORD || 'AarogyaAppRuntime2026!');
    const defaultAdminUrl = rawUrl.includes('aarogyadamu_app:')
      ? rawUrl.replace('aarogyadamu_app:AarogyaAppRuntime2026!', 'aarogyadamu_dev:local-audit-password')
      : rawUrl;
    const adminUrl = setDbAndAuth(process.env.ADMIN_DATABASE_URL || defaultAdminUrl, targetDb);

    appPrisma = new PrismaClient({ datasources: { db: { url: appUrl } } });
    adminPrisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });

    const ts = Date.now();
    const ensureFixtureUser = async (email: string, fullName: string, isClinician = false, isSyntheticDemo = false) => {
      const existing = await adminPrisma.user.findUnique({ where: { email } });
      if (existing) return existing;
      return adminPrisma.user.create({
        data: {
          email,
          passwordHash: 'fixture-hash-not-used-for-login',
          isClinician,
          isSyntheticDemo,
          isActive: true,
          profile: { create: { fullName } },
        },
      });
    };

    // Provision distinct fixture actors so cross-patient & immutability assertions never collapse onto the same row
    doctor = await ensureFixtureUser(`rls.groupa.doc.${ts}@aarogyadamu.local`, 'RLS GroupA Doctor', true, true);
    patient1 = await ensureFixtureUser(`rls.groupa.pat1.${ts}@aarogyadamu.local`, 'RLS GroupA Patient 1', false, true);
    patient2 = await ensureFixtureUser(`rls.groupa.pat2.${ts}@aarogyadamu.local`, 'RLS GroupA Patient 2', false, true);
    pilotPatient = await ensureFixtureUser(`rls.groupa.t2d.${ts}@aarogyadamu.local`, 'RLS GroupA Pilot T2D', false, true);
    caregiverUser = await ensureFixtureUser(`rls.groupa.caregiver.${ts}@family.aarogyadamu.local`, 'RLS GroupA Caregiver', false, false);
    nurse = await ensureFixtureUser(`rls.groupa.nurse.${ts}@aarogyadamu.local`, 'RLS GroupA Nurse', true, true);
  });

  afterAll(async () => {
    await appPrisma?.$disconnect();
    await adminPrisma?.$disconnect();
  });

  test('01. Connected role is strictly NOSUPERUSER and NOBYPASSRLS', async () => {
    const who = await appPrisma.$queryRawUnsafe<any[]>(
      `SELECT current_user, session_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;`
    );
    expect(who[0].rolsuper).toBe(false);
    expect(who[0].rolbypassrls).toBe(false);
  });

  test('02. Patient Self Access to HealthDocument (INSERT & SELECT)', async () => {
    const docId = 'jest-doc-self-' + Date.now();
    await withTenantTransaction(appPrisma, { userId: patient1.id, role: 'PATIENT' }, async (tx) => {
      await tx.healthDocument.create({
        data: {
          id: docId,
          userId: patient1.id,
          title: '[JEST-RLS] Patient Self Document',
          category: 'LAB_REPORT',
          processingStatus: 'READY',
        },
      });
      const read = await tx.healthDocument.findUnique({ where: { id: docId } });
      expect(read).not.toBeNull();
      expect(read?.id).toBe(docId);
    });
  });

  test('03. AUDIT_RECORDER with valid patient context & single-row readback', async () => {
    const eventId = crypto.randomUUID();
    await withTenantTransaction(
      appPrisma,
      {
        isSystemWorker: true,
        workerScope: 'AUDIT_RECORDER',
        patientId: patient1.id,
        auditEventId: eventId,
      },
      async (tx) => {
        await tx.auditLog.create({
          data: {
            id: eventId,
            userId: patient1.id,
            actorId: 'SYSTEM_AUDIT_RECORDER',
            action: '[JEST-RLS] Background System Audit',
            entityType: 'TEST',
          },
        });
        const read = await tx.auditLog.findUnique({ where: { id: eventId } });
        expect(read).not.toBeNull();
        expect(read?.id).toBe(eventId);
      }
    );
  });

  test('04. AUDIT_RECORDER cross-patient injection rejection (Tenant Isolation)', async () => {
    const eventId = crypto.randomUUID();
    let blocked = false;
    try {
      await withTenantTransaction(
        appPrisma,
        {
          isSystemWorker: true,
          workerScope: 'AUDIT_RECORDER',
          patientId: patient1.id,
          auditEventId: eventId,
        },
        async (tx) => {
          await tx.auditLog.create({
            data: {
              id: eventId,
              userId: pilotPatient.id, // Injected cross-patient
              actorId: 'SYSTEM_AUDIT_RECORDER',
              action: '[JEST-RLS] Cross-Patient Injection Attempt',
              entityType: 'TEST',
            },
          });
        }
      );
    } catch (err: any) {
      if (err.message.includes('42501') || err.message.includes('row-level security')) {
        blocked = true;
      }
    }
    expect(blocked).toBe(true);
  });

  test('05. User Column Guard Trigger (trg_user_column_guard) rejects isSyntheticDemo mutation', async () => {
    let blocked = false;
    try {
      await withTenantTransaction(appPrisma, { userId: doctor.id, role: 'DOCTOR' }, async (tx) => {
        await tx.user.update({
          where: { id: doctor.id },
          data: { isSyntheticDemo: false },
        });
      });
    } catch (err: any) {
      if (err.message.includes('42501') && err.message.includes('unauthorized mutation of User.isSyntheticDemo')) {
        blocked = true;
      }
    }
    expect(blocked).toBe(true);
  });

  test('06. HealthDocument Column Guard Trigger rejects patient ownership transfer', async () => {
    const guardDocId = 'jest-guard-doc-' + Date.now();
    await adminPrisma.healthDocument.create({
      data: {
        id: guardDocId,
        userId: patient1.id,
        title: '[JEST-RLS] Column Guard Test Document',
        category: 'LAB_REPORT',
        storagePath: 'uploads/private/p1/doc.pdf',
        fileSizeBytes: 1024,
        mimeType: 'application/pdf',
        processingStatus: 'READY',
      },
    });

    let blocked = false;
    try {
      await withTenantTransaction(appPrisma, { userId: patient1.id, role: 'PATIENT' }, async (tx) => {
        await tx.healthDocument.update({
          where: { id: guardDocId },
          data: { userId: patient2.id },
        });
      });
    } catch (err: any) {
      if (err.message.includes('42501') && err.message.includes('cannot reassign HealthDocument patient ownership')) {
        blocked = true;
      }
    }
    expect(blocked).toBe(true);
  });
});

