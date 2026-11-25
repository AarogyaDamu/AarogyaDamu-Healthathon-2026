import request from 'supertest';
import { app } from '../server';
import { ClinicianDamuService } from '../ai/agent/clinicianDamuService';
import { ConsultationWorkspaceService } from '../services/consultationWorkspaceService';
import { PracticeService } from '../services/practiceService';
import { validateFileMagicBytes, assertSafeStoragePath } from '../services/storageService';
import { PracticeProfileUpdateSchema } from '../routes/practice.routes';
import { prisma } from '../db/prisma';

// Mock prisma for isolated security unit verification
jest.mock('../db/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    practiceMembership: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    practice: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    doctorPatientAssignment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    appointment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    healthObservation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    medicationSchedule: {
      findMany: jest.fn(),
    },
    medicationAdherenceEvent: {
      findMany: jest.fn(),
    },
    consultationNote: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    consultationPrescriptionItem: {
      create: jest.fn(),
    },
    consultationTemplate: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(prisma)),
  },
}));

describe('AarogyaDamu Complete Security Hardening & Authorization Test Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. IDOR / BOLA Prevention in ClinicianDamuService
  // =========================================================================
  describe('1. ClinicianDamuService IDOR / BOLA Prevention', () => {
    const clinicianId = 'doctor-unassigned-123';
    const practiceId = 'practice-alpha';
    const patientId = 'patient-victim-999';

    it('SEC-IDOR-01: strictly blocks summarizePatientHistory when doctor lacks assignment or appointment', async () => {
      // Mock: no active assignment, no appointment, no practice assignment
      (prisma.doctorPatientAssignment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.practiceMembership.findMany as jest.Mock).mockResolvedValue([]);

      await expect(
        ClinicianDamuService.summarizePatientHistory(clinicianId, practiceId, patientId, 90)
      ).rejects.toThrow('Unauthorized: Clinician is not actively assigned to this patient');
    });

    it('SEC-IDOR-02: strictly blocks draftConsultationNote when doctor lacks assignment or appointment', async () => {
      (prisma.doctorPatientAssignment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.practiceMembership.findMany as jest.Mock).mockResolvedValue([]);

      await expect(
        ClinicianDamuService.draftConsultationNote(clinicianId, practiceId, patientId, 'Uncontrolled sugars')
      ).rejects.toThrow('Unauthorized: Clinician is not actively assigned to this patient');
    });

    it('SEC-IDOR-03: strictly blocks compareTrends when doctor lacks assignment or appointment', async () => {
      (prisma.doctorPatientAssignment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.practiceMembership.findMany as jest.Mock).mockResolvedValue([]);

      await expect(
        ClinicianDamuService.compareTrends(clinicianId, practiceId, patientId, 'BLOOD_GLUCOSE', 30)
      ).rejects.toThrow('Unauthorized: Clinician is not actively assigned to this patient');
    });

    it('SEC-IDOR-04: allows summarizePatientHistory when active assignment exists', async () => {
      (prisma.doctorPatientAssignment.findFirst as jest.Mock).mockResolvedValue({
        id: 'assignment-1',
        doctorId: clinicianId,
        patientId,
        status: 'ACTIVE',
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: patientId,
        email: 'patient@example.com',
        profile: { fullName: 'Authorized Patient', diabetesType: 'Type 2 Diabetes' },
      });

      (prisma.healthObservation.findMany as jest.Mock).mockResolvedValue([
        { numericValue: 130, context: 'FASTING', type: 'BLOOD_GLUCOSE', observedAt: new Date() },
      ]);
      (prisma.medicationSchedule.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.consultationNote.findMany as jest.Mock).mockResolvedValue([]);

      const summary = await ClinicianDamuService.summarizePatientHistory(
        clinicianId,
        practiceId,
        patientId,
        90
      );

      expect(summary.patientId).toBe(patientId);
      expect(summary.patientName).toBe('Authorized Patient');
      expect(summary.glucoseMetrics.totalReadingsCount).toBe(1);
    });

    it('SEC-IDOR-05: strictly blocks access when appointment was CANCELLED or REJECTED', async () => {
      // Mock: No active DoctorPatientAssignment
      (prisma.doctorPatientAssignment.findFirst as jest.Mock).mockResolvedValue(null);
      // Mock: Appointment query with status not in [CANCELLED, REJECTED] returns null
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.practiceMembership.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        ClinicianDamuService.summarizePatientHistory(clinicianId, practiceId, patientId, 90)
      ).rejects.toThrow('Unauthorized: Clinician is not actively assigned to this patient');
    });
  });

  // =========================================================================
  // 2. Consultation Finalization Authorization & State Integrity
  // =========================================================================
  describe('2. Consultation Finalization Authorization & BOLA Prevention', () => {
    const doctorUserId = 'doctor-1';
    const doctorName = 'Dr. Sharma';
    const practiceId = 'practice-1';
    const patientId = 'patient-1';

    const sampleConsultationInput = {
      patientId,
      chiefComplaint: 'Quarterly review',
      diagnoses: [{ code: 'E11.9', display: 'Type 2 Diabetes', category: 'CONFIRMED' as const }],
      prescriptions: [
        {
          medicationName: 'Metformin',
          dosage: '500 mg',
          frequency: '1-0-1' as const,
          timing: 'AFTER_FOOD' as const,
          durationDays: 30,
        },
      ],
      labOrders: ['HbA1c'],
      lifestyleAdvice: 'Walk 30 mins daily',
      doctorConfirmed: true,
    };

    it('SEC-CONS-01: blocks consultation finalization by non-physicians (e.g. Receptionist)', async () => {
      (prisma.practiceMembership.findUnique as jest.Mock).mockResolvedValue({
        practiceId,
        userId: doctorUserId,
        role: 'RECEPTIONIST',
        isActive: true,
      });

      await expect(
        ConsultationWorkspaceService.finalizeConsultation(
          doctorUserId,
          doctorName,
          practiceId,
          sampleConsultationInput
        )
      ).rejects.toThrow('Unauthorized: Only licensed physicians can finalize clinical consultations');
    });

    it('SEC-CONS-02: blocks consultation finalization when doctor lacks assignment or appointment', async () => {
      (prisma.practiceMembership.findUnique as jest.Mock).mockResolvedValue({
        practiceId,
        userId: doctorUserId,
        role: 'DOCTOR',
        isActive: true,
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: patientId,
        profile: { fullName: 'Target Patient' },
      });

      // No assignment, no appointment, no other practice doctor assignment
      (prisma.doctorPatientAssignment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.practiceMembership.findMany as jest.Mock).mockResolvedValue([]);

      await expect(
        ConsultationWorkspaceService.finalizeConsultation(
          doctorUserId,
          doctorName,
          practiceId,
          sampleConsultationInput
        )
      ).rejects.toThrow('Unauthorized: Clinician is not actively assigned to this patient');
    });
  });

  // =========================================================================
  // 3. File Upload Magic Byte Inspection & Path Traversal Prevention
  // =========================================================================
  describe('3. File Upload Magic Byte Inspection & Path Traversal Protection', () => {
    it('SEC-FILE-01: detects valid PDF magic bytes (%PDF-)', () => {
      const validPdfBuffer = Buffer.from('%PDF-1.4 sample clinical report content');
      const result = validateFileMagicBytes(validPdfBuffer);
      expect(result.isValid).toBe(true);
      expect(result.detectedMime).toBe('application/pdf');
    });

    it('SEC-FILE-02: detects valid PNG magic bytes', () => {
      const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      const result = validateFileMagicBytes(validPngBuffer);
      expect(result.isValid).toBe(true);
      expect(result.detectedMime).toBe('image/png');
    });

    it('SEC-FILE-03: detects valid JPEG magic bytes', () => {
      const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const result = validateFileMagicBytes(validJpegBuffer);
      expect(result.isValid).toBe(true);
      expect(result.detectedMime).toBe('image/jpeg');
    });

    it('SEC-FILE-04: rejects malicious executable or script masquerading as PDF', () => {
      const maliciousScriptBuffer = Buffer.from('#!/bin/bash\nrm -rf /');
      const result = validateFileMagicBytes(maliciousScriptBuffer);
      expect(result.isValid).toBe(false);
      expect(result.detectedMime).toBeUndefined();
    });

    it('SEC-FILE-05: rejects empty or truncated buffers', () => {
      const emptyBuffer = Buffer.alloc(0);
      const result = validateFileMagicBytes(emptyBuffer);
      expect(result.isValid).toBe(false);
    });

    it('SEC-FILE-06: strictly prevents directory traversal attempts in assertSafeStoragePath', () => {
      expect(() => {
        assertSafeStoragePath('../../windows/system32/cmd.exe');
      }).toThrow(/Security Error: Path traversal attempt/);

      expect(() => {
        assertSafeStoragePath('/etc/shadow');
      }).toThrow(/Security Error: Path traversal attempt/);
    });
  });

  // =========================================================================
  // 4. HTTP Security Headers Verification (RFC 6797 & OWASP API Security)
  // =========================================================================
  describe('4. HTTP Security Headers Verification', () => {
    it('SEC-HDR-01: asserts all critical clinical security headers on responses', async () => {
      // 1. Plain HTTP request: HSTS must NOT be emitted per RFC 6797
      const httpRes = await request(app).get('/health');
      expect(httpRes.status).toBe(200);

      expect(httpRes.headers['x-content-type-options']).toBe('nosniff');
      expect(httpRes.headers['x-frame-options']).toBe('DENY');
      // Deprecated X-XSS-Protection set to 0 per modern OWASP standard
      expect(httpRes.headers['x-xss-protection']).toBe('0');
      // Plain HTTP must not emit HSTS
      expect(httpRes.headers['strict-transport-security']).toBeUndefined();
      // Strict REST API CSP: default-src 'none'
      expect(httpRes.headers['content-security-policy']).toBe(
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
      );
      expect(httpRes.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(httpRes.headers['permissions-policy']).toBeDefined();
      expect(httpRes.headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(httpRes.headers['cross-origin-resource-policy']).toBe('same-origin');

      // Server fingerprinting suppression
      expect(httpRes.headers['x-powered-by']).toBeUndefined();

      // 2. HTTPS request: HSTS emitted with max-age=31536000
      const httpsRes = await request(app)
        .get('/health')
        .set('X-Forwarded-Proto', 'https');
      expect(httpsRes.status).toBe(200);
      expect(httpsRes.headers['strict-transport-security']).toContain('max-age=31536000');
    });
  });

  // =========================================================================
  // 5. Practice RBAC & Privilege Escalation Protection
  // =========================================================================
  describe('5. Practice RBAC & Staff Management Protection', () => {
    it('SEC-RBAC-01: non-owner staff cannot invite or add members', async () => {
      (prisma.practiceMembership.findUnique as jest.Mock).mockResolvedValue({
        practiceId: 'p-1',
        userId: 'doctor-not-owner',
        role: 'DOCTOR',
        isActive: true,
      });

      await expect(
        PracticeService.addStaffMember('doctor-not-owner', 'p-1', 'newstaff@example.com', 'RECEPTIONIST')
      ).rejects.toThrow('Unauthorized: Only the practice owner can add staff members');
    });

    it('SEC-RBAC-02: requires existing registered account before adding staff', async () => {
      (prisma.practiceMembership.findUnique as jest.Mock).mockResolvedValue({
        practiceId: 'p-1',
        userId: 'owner-1',
        role: 'OWNER',
        isActive: true,
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        PracticeService.addStaffMember('owner-1', 'p-1', 'unregistered@example.com', 'RECEPTIONIST')
      ).rejects.toThrow('does not have an AarogyaDamu account');
    });

    it('SEC-RBAC-03: PracticeProfileUpdateSchema strictly rejects unauthorized administrative / tenant fields', () => {
      // Tampering attempt injecting id, slug, tier, ownerId, registrationNumber, isActive
      const maliciousPayload = {
        practiceName: 'Hacked Clinic Name',
        id: 'tampered-uuid-1234',
        slug: 'hacked-slug',
        ownerId: 'attacker-id',
        tier: 'ENTERPRISE_UNLIMITED',
        registrationNumber: 'FAKE-REG-999',
        isActive: false,
      };

      const result = PracticeProfileUpdateSchema.safeParse(maliciousPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const unrecognizedKeys = result.error.issues.map((i) => (i as any).keys || i.path);
        expect(unrecognizedKeys.length).toBeGreaterThan(0);
      }
    });

    it('SEC-RBAC-04: PracticeProfileUpdateSchema validates permitted clinical fields correctly', () => {
      const validPayload = {
        practiceName: 'Updated Diabetes Clinic',
        consultationFeeInr: 800,
        postalCode: '560001',
        city: 'Bengaluru',
        state: 'Karnataka',
        phone: '+919876543210',
        workingDays: ['Monday', 'Tuesday', 'Wednesday'],
        workingHours: [
          {
            day: 'MON' as const,
            openTime: '09:00',
            closeTime: '18:00',
            isOpen: true,
          },
        ],
      };

      const result = PracticeProfileUpdateSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });
  });
});
