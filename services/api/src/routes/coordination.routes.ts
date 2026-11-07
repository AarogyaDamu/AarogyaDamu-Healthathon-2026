import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PRE_VISIT_QUESTIONNAIRE_QUESTIONS } from '@aarogyadamu/contracts';

import {
  requireAuth,
  AuthenticatedRequest,
} from '../middleware/auth';

import { requireClinician } from '../middleware/requireClinician';

const router = Router();
import { prisma } from '../db/prisma';

router.use(requireAuth);

const appointmentSchema = z.object({
  patientId: z.string().uuid().optional(),
  doctorId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(10).max(120).optional(),
  reason: z.string().trim().min(3).max(2000),
  visitType: z.enum([
    'CHECKUP',
    'FOLLOW_UP',
    'DIABETES_REVIEW',
    'EMERGENCY',
    'OTHER',
    'IN_PERSON',
    'VIDEO_CONSULT',
    'HOME_VISIT',
    'EMERGENCY_TRIAGE',
  ]).optional(),
  clinicName: z.string().trim().max(150).optional(),
  clinicFacilityId: z.string().trim().max(100).optional(),
  questionnaireResponse: z.union([z.record(z.string(), z.any()), z.string()]).optional(),
  idempotencyKey: z.string().min(16).max(128).optional(),
}).strict();

const appointmentStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED', 'RESCHEDULED', 'MISSED']),
  rejectionReason: z.string().trim().max(500).optional(),
  cancellationReason: z.string().trim().max(500).optional(),
  newScheduledAt: z.string().datetime({ offset: true }).optional(),
  newDurationMinutes: z.number().int().min(10).max(120).optional(),
}).strict();

function getActor(req: Request) {
  return (req as AuthenticatedRequest).user;
}

function parsePermissions(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

async function activeConsent(
  patientId: string,
  caregiverEmail: string,
) {
  return prisma.caregiverConsent.findFirst({
    where: {
      patientId,
      caregiverEmail,
      status: 'ACTIVE',
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });
}

async function caregiverHasPermission(
  patientId: string,
  email: string,
  permission: string,
): Promise<boolean> {
  const consent = await activeConsent(patientId, email);

  return !!consent &&
    parsePermissions(consent.permissions).includes(permission);
}

const appointmentInclude = {
  patient: {
    select: {
      id: true,
      email: true,
      profile: {
        select: { fullName: true, dateOfBirth: true, diabetesType: true },
      },
    },
  },
  doctor: {
    select: {
      id: true,
      email: true,
      profile: {
        select: { fullName: true },
      },
    },
  },
} as const;

function presentAppointment(appointment: any, isCaregiver: boolean = false) {
  let parsedQuestionnaire = null;
  if (!isCaregiver && appointment.questionnaireResponse) {
    try {
      parsedQuestionnaire = typeof appointment.questionnaireResponse === 'string'
        ? JSON.parse(appointment.questionnaireResponse)
        : appointment.questionnaireResponse;
    } catch {
      parsedQuestionnaire = appointment.questionnaireResponse;
    }
  }

  return {
    id: appointment.id,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    patientName: appointment.patient?.profile?.fullName ?? 'Patient',
    patientEmail: appointment.patient?.email ?? undefined,
    patientDateOfBirth: appointment.patient?.profile?.dateOfBirth ?? null,
    patientDiabetesType: appointment.patient?.profile?.diabetesType ?? 'UNKNOWN',
    doctorName:
      appointment.doctor?.profile?.fullName ??
      appointment.doctor?.email ??
      'Doctor',
    doctorEmail: appointment.doctor?.email ?? undefined,
    scheduledAt: appointment.scheduledAt.toISOString(),
    durationMinutes: appointment.durationMinutes,
    reason: appointment.reason,
    visitType: appointment.visitType,
    status: appointment.status,
    clinicName: appointment.clinicName ?? 'Apollo Sugar Clinic, Pune',
    clinicFacilityId: appointment.clinicFacilityId ?? null,
    questionnaireResponse: isCaregiver ? null : parsedQuestionnaire,
    rejectionReason: appointment.rejectionReason ?? null,
    cancellationReason: appointment.cancellationReason ?? null,
    rescheduledFromId: appointment.rescheduledFromId ?? null,
    completedAt: appointment.completedAt ? appointment.completedAt.toISOString() : null,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  };
}

function respondWithError(
  res: Response,
  error: unknown,
  fallback: string,
) {
  if (String(error).includes('APPOINTMENT_OVERLAP')) {
    res.status(409).json({ error: 'The doctor already has an overlapping appointment.' });
    return;
  }
  if (String(error).includes('DOCTOR_ON_LEAVE')) {
    res.status(409).json({ error: 'The doctor is on leave during the selected time.' });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: 'Invalid request.',
      issues: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  ) {
    res.status(409).json({
      error: 'A conflicting or duplicate record already exists.',
    });
    return;
  }

  // Avoid logging tokens, request bodies or patient health information.
  console.error('[coordination API] Request failed');
  res.status(500).json({ error: fallback });
}

// ------------------------------------------------------
// GET /api/coordination/context
// The backend determines the user's available workspace.
// ------------------------------------------------------
router.get('/context', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);

    if (!actor) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const caregiverConsents = await prisma.caregiverConsent.findMany({
      where: {
        caregiverEmail: actor.email,
        status: 'ACTIVE',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        patient: {
          select: {
            id: true,
            profile: {
              select: { fullName: true },
            },
          },
        },
      },
    });

    const availableRoles = ['PATIENT'];

    if (actor.isClinician) {
      availableRoles.push('DOCTOR');
    }

    if (caregiverConsents.length > 0) {
      availableRoles.push('CAREGIVER');
    }

    const defaultRole = actor.isClinician
      ? 'DOCTOR'
      : caregiverConsents.length > 0
        ? 'CAREGIVER'
        : 'PATIENT';

    res.json({
      userId: actor.id,
      isClinician: actor.isClinician,
      defaultRole,
      availableRoles,
      caregiverPatients: caregiverConsents.map((consent) => ({
        patientId: consent.patient.id,
        name: consent.patient.profile?.fullName ?? 'Patient',
        permissions: parsePermissions(consent.permissions),
      })),
    });
  } catch (error) {
    respondWithError(res, error, 'Unable to load your workspace.');
  }
});

// ------------------------------------------------------
// GET /api/coordination/doctors
// Only lists accounts approved as clinicians in the DB.
// ------------------------------------------------------
router.get('/doctors', async (_req: Request, res: Response) => {
  try {
    const doctors = await prisma.user.findMany({
      where: { isClinician: true },
      select: {
        id: true,
        email: true,
        profile: {
          select: { fullName: true },
        },
        doctorAvailabilities: {
          where: { isActive: true },
          select: {
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            slotDurationMinutes: true,
            clinicName: true,
          },
        },
      },
      orderBy: { email: 'asc' },
    });

    res.json({
      doctors: doctors.map((doctor) => ({
        id: doctor.id,
        name: doctor.profile?.fullName ?? doctor.email,
        email: doctor.email,
        clinicName: doctor.doctorAvailabilities[0]?.clinicName ?? 'Apollo Sugar Clinic, Pune',
        availableDays: doctor.doctorAvailabilities.length > 0
          ? doctor.doctorAvailabilities.map((a) => a.dayOfWeek)
          : [1, 2, 3, 4, 5],
        availabilities: doctor.doctorAvailabilities,
      })),
    });
  } catch (error) {
    respondWithError(res, error, 'Unable to load the doctor directory.');
  }
});

// ------------------------------------------------------
// GET /api/coordination/questionnaire
// Exposes the 18-question pre-visit clinical assessment
// protocol aligned with Apollo Sugar Clinics standards.
// ------------------------------------------------------
router.get('/questionnaire', async (_req: Request, res: Response) => {
  res.json({
    protocol: 'AarogyaDamu Configurable Pre-Consultation Diabetes Assessment Protocol',
    version: '1.0',
    alignment: 'Apollo Sugar Clinics Clinical Intake Framework',
    disclaimer:
      'This pre-consultation assessment collects clinical intake context to prepare your treating physician. It does not provide medical diagnosis, dosage advice, or treatment directives. If experiencing severe hypoglycemia, chest pain, or ketoacidosis symptoms, seek emergency medical care immediately.',
    totalQuestions: PRE_VISIT_QUESTIONNAIRE_QUESTIONS.length,
    questions: PRE_VISIT_QUESTIONNAIRE_QUESTIONS,
  });
});

// ------------------------------------------------------
// GET /api/coordination/doctors/:doctorId/availability
// Calculates real-time available appointment slots for a given date.
// ------------------------------------------------------
router.get('/doctors/:doctorId/availability', async (req: Request, res: Response) => {
  try {
    const { doctorId } = req.params;
    const dateStr = typeof req.query.date === 'string' ? req.query.date : '';

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      res.status(400).json({ error: 'Valid date parameter (YYYY-MM-DD) is required.' });
      return;
    }

    const doctor = await prisma.user.findFirst({
      where: { id: doctorId, isClinician: true },
      include: {
        profile: { select: { fullName: true } },
      },
    });

    if (!doctor) {
      res.status(404).json({ error: 'Doctor not found or not an active clinician.' });
      return;
    }

    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const dayOfWeek = dateObj.getUTCDay();

    const availability = await prisma.doctorAvailability.findUnique({
      where: {
        doctorId_dayOfWeek: {
          doctorId: doctor.id,
          dayOfWeek,
        },
      },
    });

    let startTime = '09:00';
    let endTime = '17:00';
    let slotDurationMinutes = 30;
    let clinicName = 'Apollo Sugar Clinic, Pune';
    let isWorkingDay = true;

    if (availability) {
      if (!availability.isActive) {
        isWorkingDay = false;
      } else {
        startTime = availability.startTime;
        endTime = availability.endTime;
        slotDurationMinutes = availability.slotDurationMinutes;
        clinicName = availability.clinicName || clinicName;
      }
    } else {
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        isWorkingDay = false;
      }
    }

    if (!isWorkingDay) {
      res.json({
        date: dateStr,
        doctorId: doctor.id,
        doctorName: doctor.profile?.fullName ?? doctor.email,
        clinicName,
        isWorkingDay: false,
        message: 'Doctor is not available on this day.',
        slots: [],
      });
      return;
    }

    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    const timeOffs = await prisma.doctorTimeOff.findMany({
      where: {
        doctorId: doctor.id,
        startDate: { lte: endOfDay },
        endDate: { gte: startOfDay },
      },
    });

    const existingAppointments = await prisma.appointment.findMany({
      where: {
        doctorId: doctor.id,
        status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'] },
        scheduledAt: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
        status: true,
      },
    });

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    let currentMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;
    const now = new Date();

    const slots: Array<{
      startTime: string;
      endTime: string;
      scheduledAt: string;
      available: boolean;
      reason?: string;
    }> = [];

    while (currentMin + slotDurationMinutes <= endMin) {
      const sH = Math.floor(currentMin / 60);
      const sM = currentMin % 60;
      const eTotal = currentMin + slotDurationMinutes;
      const eH = Math.floor(eTotal / 60);
      const eM = eTotal % 60;

      const startTimeStr = `${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}`;
      const endTimeStr = `${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}`;
      const slotDate = new Date(Date.UTC(year, month - 1, day, sH, sM, 0));
      const slotEndDate = new Date(Date.UTC(year, month - 1, day, eH, eM, 0));

      let available = true;
      let reason: string | undefined = undefined;

      if (slotDate.getTime() < now.getTime()) {
        available = false;
        reason = 'Past slot';
      } else if (timeOffs.some((to) => to.startDate <= slotEndDate && to.endDate >= slotDate)) {
        available = false;
        reason = 'Doctor on leave';
      } else {
        const overlap = existingAppointments.some((a) => {
          const aStart = a.scheduledAt.getTime();
          const aEnd = aStart + a.durationMinutes * 60000;
          return slotDate.getTime() < aEnd && aStart < slotEndDate.getTime();
        });
        if (overlap) {
          available = false;
          reason = 'Booked';
        }
      }

      slots.push({
        startTime: startTimeStr,
        endTime: endTimeStr,
        scheduledAt: slotDate.toISOString(),
        available,
        reason,
      });

      currentMin += slotDurationMinutes;
    }

    res.json({
      date: dateStr,
      doctorId: doctor.id,
      doctorName: doctor.profile?.fullName ?? doctor.email,
      clinicName,
      slotDurationMinutes,
      isWorkingDay: true,
      slots,
    });
  } catch (error) {
    respondWithError(res, error, 'Unable to calculate doctor availability.');
  }
});

// ------------------------------------------------------
// Doctor Availability Configuration Endpoints
// ------------------------------------------------------
router.get(
  '/doctor/availability',
  requireClinician,
  async (req: Request, res: Response) => {
    try {
      const actor = getActor(req)!;
      const availabilities = await prisma.doctorAvailability.findMany({
        where: { doctorId: actor.id },
        orderBy: { dayOfWeek: 'asc' },
      });
      const timeOffs = await prisma.doctorTimeOff.findMany({
        where: { doctorId: actor.id, endDate: { gte: new Date() } },
        orderBy: { startDate: 'asc' },
      });
      res.json({ availabilities, timeOffs });
    } catch (error) {
      respondWithError(res, error, 'Unable to load doctor schedule configuration.');
    }
  },
);

router.put(
  '/doctor/availability',
  requireClinician,
  async (req: Request, res: Response) => {
    try {
      const actor = getActor(req)!;
      const schema = z.object({
        schedules: z.array(
          z.object({
            dayOfWeek: z.number().int().min(0).max(6),
            startTime: z.string().regex(/^\d{2}:\d{2}$/),
            endTime: z.string().regex(/^\d{2}:\d{2}$/),
            slotDurationMinutes: z.number().int().min(10).max(120).default(30),
            isActive: z.boolean().default(true),
            clinicName: z.string().trim().max(150).optional(),
          }),
        ),
      });

      const { schedules } = schema.parse(req.body);

      await prisma.$transaction(
        schedules.map((s) =>
          prisma.doctorAvailability.upsert({
            where: {
              doctorId_dayOfWeek: {
                doctorId: actor.id,
                dayOfWeek: s.dayOfWeek,
              },
            },
            create: {
              doctorId: actor.id,
              dayOfWeek: s.dayOfWeek,
              startTime: s.startTime,
              endTime: s.endTime,
              slotDurationMinutes: s.slotDurationMinutes,
              isActive: s.isActive,
              clinicName: s.clinicName,
            },
            update: {
              startTime: s.startTime,
              endTime: s.endTime,
              slotDurationMinutes: s.slotDurationMinutes,
              isActive: s.isActive,
              clinicName: s.clinicName,
            },
          }),
        ),
      );

      res.json({ success: true, message: 'Availability schedule updated.' });
    } catch (error) {
      respondWithError(res, error, 'Unable to update availability schedule.');
    }
  },
);

router.post(
  '/doctor/time-off',
  requireClinician,
  async (req: Request, res: Response) => {
    try {
      const actor = getActor(req)!;
      const schema = z.object({
        startDate: z.string().datetime({ offset: true }),
        endDate: z.string().datetime({ offset: true }),
        reason: z.string().trim().max(300).optional(),
      });
      const input = schema.parse(req.body);
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);

      if (end <= start) {
        res.status(400).json({ error: 'End date must be after start date.' });
        return;
      }

      const created = await prisma.doctorTimeOff.create({
        data: {
          doctorId: actor.id,
          startDate: start,
          endDate: end,
          reason: input.reason,
        },
      });

      res.status(201).json({ timeOff: created });
    } catch (error) {
      respondWithError(res, error, 'Unable to schedule time off.');
    }
  },
);

router.delete(
  '/doctor/time-off/:id',
  requireClinician,
  async (req: Request, res: Response) => {
    try {
      const actor = getActor(req)!;
      const existing = await prisma.doctorTimeOff.findFirst({
        where: { id: req.params.id, doctorId: actor.id },
      });
      if (!existing) {
        res.status(404).json({ error: 'Time off record not found.' });
        return;
      }
      await prisma.doctorTimeOff.delete({ where: { id: existing.id } });
      res.json({ success: true, message: 'Time off deleted.' });
    } catch (error) {
      respondWithError(res, error, 'Unable to delete time off.');
    }
  },
);

// ------------------------------------------------------
// GET /api/coordination/doctor/patients
// Only ACTIVE assignments are visible here.
// ------------------------------------------------------
router.get(
  '/doctor/patients',
  requireClinician,
  async (req: Request, res: Response) => {
    try {
      const actor = getActor(req);

      if (!actor) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const assignments = await prisma.doctorPatientAssignment.findMany({
        where: {
          doctorId: actor.id,
          status: 'ACTIVE',
        },
        include: {
          patient: {
            select: {
              id: true,
              profile: {
                select: {
                  fullName: true,
                  dateOfBirth: true,
                  diabetesType: true,
                  primaryClinician: true,
                },
              },
              observations: {
                orderBy: { observedAt: 'desc' },
                take: 5,
                select: {
                  id: true,
                  type: true,
                  numericValue: true,
                  unit: true,
                  context: true,
                  observedAt: true,
                },
              },
            },
          },
        },
        orderBy: { activatedAt: 'desc' },
      });

      res.json({
        patients: assignments.map((assignment) => ({
          patientId: assignment.patient.id,
          name: assignment.patient.profile?.fullName ?? 'Patient',
          dateOfBirth: assignment.patient.profile?.dateOfBirth ?? null,
          diabetesType: assignment.patient.profile?.diabetesType ?? 'UNKNOWN',
          observations: assignment.patient.observations,
          assignedAt: assignment.activatedAt,
        })),
      });
    } catch (error) {
      respondWithError(res, error, 'Unable to load assigned patients.');
    }
  },
);

// ------------------------------------------------------
// GET /api/coordination/caregiver/patients
// Returns only patients with active caregiver consent.
// ------------------------------------------------------
router.get('/caregiver/patients', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);

    if (!actor) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const consents = await prisma.caregiverConsent.findMany({
      where: {
        caregiverEmail: actor.email,
        status: 'ACTIVE',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        patient: {
          select: {
            id: true,
            profile: {
              select: {
                fullName: true,
                diabetesType: true,
              },
            },
          },
        },
      },
    });

    res.json({
      patients: consents.map((consent) => ({
        patientId: consent.patient.id,
        name: consent.patient.profile?.fullName ?? 'Patient',
        diabetesType: consent.patient.profile?.diabetesType ?? 'UNKNOWN',
        permissions: parsePermissions(consent.permissions),
      })),
    });
  } catch (error) {
    respondWithError(res, error, 'Unable to load caregiver dependents.');
  }
});

// ------------------------------------------------------
// GET /api/coordination/appointments
// Doctors see their appointments. Patients see their own.
// Caregivers need VIEW_APPOINTMENTS or MANAGE_CONSULTATIONS
// permission to view their dependent's appointments.
// Supports filters: ?status=..., ?visitType=..., ?filter=TODAY|UPCOMING|REQUESTS|HISTORY, ?date=YYYY-MM-DD
// ------------------------------------------------------
router.get('/appointments', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);

    if (!actor) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    let where: any = {};
    let isCaregiver = false;

    if (actor.isClinician) {
      where.doctorId = actor.id;
      if (typeof req.query.patientId === 'string') {
        where.patientId = req.query.patientId;
      }
    } else {
      const requestedPatientId =
        typeof req.query.patientId === 'string'
          ? req.query.patientId
          : actor.id;

      if (requestedPatientId !== actor.id) {
        const allowed =
          (await caregiverHasPermission(
            requestedPatientId,
            actor.email,
            'VIEW_APPOINTMENTS',
          )) ||
          (await caregiverHasPermission(
            requestedPatientId,
            actor.email,
            'MANAGE_CONSULTATIONS',
          ));

        if (!allowed) {
          res.status(403).json({
            error: 'Appointment access requires explicit caregiver permission.',
          });
          return;
        }
        isCaregiver = true;
      }

      where.patientId = requestedPatientId;
    }

    // Filter by specific status (comma-separated or single)
    if (typeof req.query.status === 'string') {
      const statuses = req.query.status.split(',').map((s) => s.trim());
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }

    // Filter by visitType
    if (typeof req.query.visitType === 'string') {
      where.visitType = req.query.visitType;
    }

    // Filter preset: TODAY, UPCOMING, REQUESTS, HISTORY
    const filter = req.query.filter as string | undefined;
    const now = new Date();
    if (filter === 'TODAY') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      where.scheduledAt = { gte: startOfDay, lte: endOfDay };
    } else if (filter === 'UPCOMING') {
      where.scheduledAt = { gte: now };
      if (!where.status) {
        where.status = { in: ['CONFIRMED', 'REQUESTED', 'RESCHEDULED'] };
      }
    } else if (filter === 'REQUESTS') {
      where.status = 'REQUESTED';
    } else if (filter === 'HISTORY') {
      if (!where.status) {
        where.status = { in: ['COMPLETED', 'CANCELLED', 'DECLINED', 'MISSED'] };
      }
    }

    // Filter by specific date (YYYY-MM-DD)
    if (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
      const [y, m, d] = req.query.date.split('-').map(Number);
      const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
      const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
      where.scheduledAt = { gte: start, lte: end };
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: appointmentInclude,
      orderBy: { scheduledAt: 'asc' },
    });

    res.json({
      appointments: appointments.map((a) => presentAppointment(a, isCaregiver)),
    });
  } catch (error) {
    respondWithError(res, error, 'Unable to load appointments.');
  }
});

// ------------------------------------------------------
// POST /api/coordination/appointments
// Patient/caregiver booking creates REQUESTED with questionnaire.
// Doctor scheduling creates CONFIRMED.
// Transaction-safe conflict check guarantees no double-booking.
// ------------------------------------------------------
router.post('/appointments', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);

    if (!actor) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const input = appointmentSchema.parse(req.body);

    const patientId = actor.isClinician
      ? input.patientId
      : input.patientId ?? actor.id;

    const doctorId = actor.isClinician
      ? actor.id
      : input.doctorId;

    if (!patientId || !doctorId) {
      res.status(400).json({
        error: 'A patient and doctor must be selected.',
      });
      return;
    }

    const scheduledAt = new Date(input.scheduledAt);

    if (scheduledAt.getTime() < Date.now() + 60_000) {
      res.status(400).json({
        error: 'Choose an appointment time at least one minute in the future.',
      });
      return;
    }

    // When a caregiver books for someone else, check their consent.
    if (!actor.isClinician && patientId !== actor.id) {
      const allowed =
        (await caregiverHasPermission(
          patientId,
          actor.email,
          'VIEW_APPOINTMENTS',
        )) ||
        (await caregiverHasPermission(
          patientId,
          actor.email,
          'MANAGE_CONSULTATIONS',
        ));

      if (!allowed) {
        res.status(403).json({
          error: 'You do not have permission to book appointments for this patient.',
        });
        return;
      }
    }

    const patient = await prisma.user.findUnique({
      where: { id: patientId },
      select: { id: true, email: true, profile: { select: { fullName: true } } },
    });

    const doctor = await prisma.user.findFirst({
      where: {
        id: doctorId,
        isClinician: true,
      },
      select: { id: true, email: true, profile: { select: { fullName: true } } },
    });

    if (!patient || !doctor) {
      res.status(404).json({
        error: 'The selected patient or approved doctor could not be found.',
      });
      return;
    }

    if (actor.isClinician) {
      const assignment = await prisma.doctorPatientAssignment.findUnique({
        where: {
          doctorId_patientId: { doctorId, patientId },
        },
      });

      if (!assignment || assignment.status !== 'ACTIVE') {
        res.status(403).json({
          error: 'Doctors may schedule visits only for their active assigned patients.',
        });
        return;
      }
    }

    if (input.idempotencyKey) {
      const previous = await prisma.appointment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: appointmentInclude,
      });

      if (previous) {
        if (
          previous.patientId !== patientId ||
          previous.doctorId !== doctorId ||
          previous.bookedById !== actor.id
        ) {
          res.status(409).json({
            error: 'This booking key has already been used.',
          });
          return;
        }

        res.json({
          appointment: presentAppointment(previous),
          duplicate: true,
        });
        return;
      }
    }

    const status = actor.isClinician ? 'CONFIRMED' : 'REQUESTED';
    const durationMinutes = input.durationMinutes ?? 30;

    const created = await prisma.$transaction(async (tx) => {
      // 1. Transaction-safe conflict check to eliminate double-booking
      const start = scheduledAt;
      const end = new Date(start.getTime() + durationMinutes * 60000);

      const candidates = await tx.appointment.findMany({
        where: {
          doctorId,
          status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'] },
          scheduledAt: { lt: end },
        },
        select: { id: true, scheduledAt: true, durationMinutes: true },
      });

      const hasOverlap = candidates.some((c) => {
        const cEnd = new Date(c.scheduledAt.getTime() + c.durationMinutes * 60000);
        return start.getTime() < cEnd.getTime() && c.scheduledAt.getTime() < end.getTime();
      });

      if (hasOverlap) {
        throw new Error('APPOINTMENT_OVERLAP');
      }

      // 2. Check doctor time-off / blocked days
      const timeOff = await tx.doctorTimeOff.findFirst({
        where: {
          doctorId,
          startDate: { lte: end },
          endDate: { gte: start },
        },
      });

      if (timeOff) {
        throw new Error('DOCTOR_ON_LEAVE');
      }

      let serializedQuestionnaire: string | null = null;
      if (input.questionnaireResponse) {
        serializedQuestionnaire =
          typeof input.questionnaireResponse === 'string'
            ? input.questionnaireResponse
            : JSON.stringify(input.questionnaireResponse);
      }

      const appointment = await tx.appointment.create({
        data: {
          patientId,
          doctorId,
          bookedById: actor.id,
          scheduledAt,
          durationMinutes,
          reason: input.reason,
          visitType: input.visitType ?? 'CHECKUP',
          status,
          clinicName: input.clinicName ?? 'Apollo Sugar Clinic, Pune',
          clinicFacilityId: input.clinicFacilityId,
          questionnaireResponse: serializedQuestionnaire,
          idempotencyKey: input.idempotencyKey,
        },
        include: appointmentInclude,
      });

      if (!actor.isClinician) {
        const assignment = await tx.doctorPatientAssignment.findUnique({
          where: {
            doctorId_patientId: { doctorId, patientId },
          },
        });

        if (!assignment) {
          await tx.doctorPatientAssignment.create({
            data: { doctorId, patientId, status: 'PENDING' },
          });
        } else if (assignment.status === 'ENDED') {
          await tx.doctorPatientAssignment.update({
            where: { id: assignment.id },
            data: {
              status: 'PENDING',
              endedAt: null,
              activatedAt: null,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: patientId,
          actorId: actor.id,
          action: 'APPOINTMENT_BOOKED',
          entityType: 'Appointment',
          entityId: appointment.id,
          metadata: JSON.stringify({
            status,
            visitType: appointment.visitType,
            hasQuestionnaire: !!serializedQuestionnaire,
          }),
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      });

      // Dispatch Notifications
      if (!actor.isClinician) {
        await tx.careNotification.create({
          data: {
            userId: doctorId,
            patientId,
            actorId: actor.id,
            type: 'APPOINTMENT_REQUEST',
            category: 'APPOINTMENT',
            title: 'New Appointment Request',
            message: `${patient.profile?.fullName || 'Patient'} requested a ${appointment.visitType} appointment on ${scheduledAt.toLocaleDateString()}.`,
            link: '/doctor/appointments',
          },
        }).catch(() => {});
      }

      await tx.careNotification.create({
        data: {
          userId: patientId,
          patientId,
          actorId: actor.id,
          type: 'APPOINTMENT_UPDATE',
          category: 'APPOINTMENT',
          title: actor.isClinician ? 'Appointment Scheduled' : 'Appointment Requested',
          message: actor.isClinician
            ? `Your consultation with Dr. ${doctor.profile?.fullName || doctor.email} has been scheduled for ${scheduledAt.toLocaleDateString()}.`
            : `Your appointment request with Dr. ${doctor.profile?.fullName || doctor.email} for ${scheduledAt.toLocaleDateString()} has been submitted.`,
          link: '/appointments',
        },
      }).catch(() => {});

      return appointment;
    });

    res.status(201).json({
      appointment: presentAppointment(created),
    });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2003') {
      const actor = getActor(req);
      const parsed = appointmentSchema.safeParse(req.body);
      if (actor && parsed.success) {
        const doctorId = actor.isClinician ? actor.id : parsed.data.doctorId;
        const start = new Date(parsed.data.scheduledAt);
        const end = new Date(start.getTime() + (parsed.data.durationMinutes ?? 30) * 60000);
        if (doctorId) {
          const candidates = await prisma.appointment.findMany({
            where: {
              doctorId,
              status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'] },
              scheduledAt: { lt: end },
            },
            select: { scheduledAt: true, durationMinutes: true },
          });
          if (candidates.some((a) => a.scheduledAt.getTime() + a.durationMinutes * 60000 > start.getTime())) {
            res.status(409).json({ error: 'The doctor already has an overlapping appointment.' });
            return;
          }
        }
      }
    }
    respondWithError(res, error, 'Unable to create the appointment.');
  }
});

// ------------------------------------------------------
// PATCH /api/coordination/appointments/:id/status
// Clinician confirms, declines (with reason), reschedules,
// completes, or marks missed.
// Patient or authorized caregiver can cancel (with reason)
// or request reschedule.
// ------------------------------------------------------
router.patch(
  '/appointments/:id/status',
  async (req: Request, res: Response) => {
    try {
      const actor = getActor(req);

      if (!actor) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const input = appointmentStatusSchema.parse(req.body);
      const { status } = input;

      const appointment = await prisma.appointment.findUnique({
        where: { id: req.params.id },
        include: appointmentInclude,
      });

      if (!appointment) {
        res.status(404).json({ error: 'Appointment not found.' });
        return;
      }

      let newScheduledAt: Date | undefined;
      let newDurationMinutes: number | undefined;

      if (actor.isClinician) {
        if (appointment.doctorId !== actor.id) {
          res.status(403).json({
            error: 'You cannot change another doctor’s appointment.',
          });
          return;
        }

        const validTransition =
          (status === 'CONFIRMED' && ['REQUESTED', 'RESCHEDULED'].includes(appointment.status)) ||
          (status === 'DECLINED' && appointment.status === 'REQUESTED') ||
          (status === 'COMPLETED' && appointment.status === 'CONFIRMED') ||
          (status === 'MISSED' && appointment.status === 'CONFIRMED') ||
          (status === 'RESCHEDULED' && ['REQUESTED', 'CONFIRMED'].includes(appointment.status)) ||
          (status === 'CANCELLED' && ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'].includes(appointment.status));

        if (!validTransition) {
          res.status(409).json({
            error: 'That appointment status transition is not allowed.',
          });
          return;
        }

        if (status === 'RESCHEDULED') {
          if (!input.newScheduledAt) {
            res.status(400).json({ error: 'A new scheduled time (newScheduledAt) is required to reschedule.' });
            return;
          }
          newScheduledAt = new Date(input.newScheduledAt);
          if (newScheduledAt.getTime() < Date.now() + 60_000) {
            res.status(400).json({ error: 'New appointment time must be in the future.' });
            return;
          }
          newDurationMinutes = input.newDurationMinutes ?? appointment.durationMinutes;
        }
      } else {
        // Patient or caregiver
        if (appointment.patientId !== actor.id) {
          const allowed =
            (await caregiverHasPermission(
              appointment.patientId,
              actor.email,
              'VIEW_APPOINTMENTS',
            )) ||
            (await caregiverHasPermission(
              appointment.patientId,
              actor.email,
              'MANAGE_CONSULTATIONS',
            ));

          if (!allowed) {
            res.status(403).json({
              error: 'You do not have permission to modify this patient’s appointment.',
            });
            return;
          }
        }

        if (!['CANCELLED', 'RESCHEDULED'].includes(status)) {
          res.status(403).json({
            error: 'Only the assigned doctor can confirm, decline or complete an appointment.',
          });
          return;
        }

        if (!['REQUESTED', 'CONFIRMED', 'RESCHEDULED'].includes(appointment.status)) {
          res.status(409).json({
            error: 'Only requested, confirmed, or rescheduled appointments can be changed.',
          });
          return;
        }

        if (status === 'RESCHEDULED') {
          if (!input.newScheduledAt) {
            res.status(400).json({ error: 'A new scheduled time (newScheduledAt) is required to reschedule.' });
            return;
          }
          newScheduledAt = new Date(input.newScheduledAt);
          if (newScheduledAt.getTime() < Date.now() + 60_000) {
            res.status(400).json({ error: 'New appointment time must be in the future.' });
            return;
          }
          newDurationMinutes = input.newDurationMinutes ?? appointment.durationMinutes;
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        // If rescheduling, check conflict at new time
        if (newScheduledAt) {
          const duration = newDurationMinutes ?? appointment.durationMinutes;
          const end = new Date(newScheduledAt.getTime() + duration * 60000);

          const candidates = await tx.appointment.findMany({
            where: {
              doctorId: appointment.doctorId,
              id: { not: appointment.id },
              status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'] },
              scheduledAt: { lt: end },
            },
            select: { id: true, scheduledAt: true, durationMinutes: true },
          });

          const hasOverlap = candidates.some((c) => {
            const cEnd = new Date(c.scheduledAt.getTime() + c.durationMinutes * 60000);
            return newScheduledAt!.getTime() < cEnd.getTime() && c.scheduledAt.getTime() < end.getTime();
          });

          if (hasOverlap) {
            throw new Error('APPOINTMENT_OVERLAP');
          }

          const timeOff = await tx.doctorTimeOff.findFirst({
            where: {
              doctorId: appointment.doctorId,
              startDate: { lte: end },
              endDate: { gte: newScheduledAt },
            },
          });

          if (timeOff) {
            throw new Error('DOCTOR_ON_LEAVE');
          }
        }

        const updateData: any = { status };
        if (status === 'DECLINED') {
          updateData.rejectionReason = input.rejectionReason || 'Declined by doctor';
        }
        if (status === 'CANCELLED') {
          updateData.cancellationReason =
            input.cancellationReason || (actor.isClinician ? 'Cancelled by doctor' : 'Cancelled by patient');
        }
        if (status === 'COMPLETED') {
          updateData.completedAt = new Date();
        }
        if (newScheduledAt) {
          updateData.scheduledAt = newScheduledAt;
          if (newDurationMinutes) {
            updateData.durationMinutes = newDurationMinutes;
          }
        }

        const result = await tx.appointment.update({
          where: { id: appointment.id },
          data: updateData,
          include: appointmentInclude,
        });

        if (status === 'CONFIRMED') {
          await tx.doctorPatientAssignment.upsert({
            where: {
              doctorId_patientId: {
                doctorId: appointment.doctorId,
                patientId: appointment.patientId,
              },
            },
            create: {
              doctorId: appointment.doctorId,
              patientId: appointment.patientId,
              status: 'ACTIVE',
              activatedAt: new Date(),
            },
            update: {
              status: 'ACTIVE',
              activatedAt: new Date(),
              endedAt: null,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: appointment.patientId,
            actorId: actor.id,
            action: `APPOINTMENT_${status}`,
            entityType: 'Appointment',
            entityId: appointment.id,
            metadata: JSON.stringify({
              status,
              rejectionReason: updateData.rejectionReason,
              cancellationReason: updateData.cancellationReason,
              newScheduledAt: newScheduledAt ? newScheduledAt.toISOString() : undefined,
            }),
            ipAddress: req.ip,
            userAgent: req.get('user-agent') ?? null,
          },
        });

        // Notifications
        let notifTitle = `Appointment ${status}`;
        let notifMessage = `Your appointment has been updated to ${status.toLowerCase()}.`;

        if (status === 'CONFIRMED') {
          notifTitle = 'Appointment Confirmed';
          notifMessage = `Your appointment with Dr. ${appointment.doctor?.profile?.fullName || 'the doctor'} on ${new Date(result.scheduledAt).toLocaleDateString()} has been confirmed.`;
        } else if (status === 'DECLINED') {
          notifTitle = 'Appointment Declined';
          notifMessage = `Your appointment request was declined. Reason: ${updateData.rejectionReason}`;
        } else if (status === 'RESCHEDULED') {
          notifTitle = 'Appointment Rescheduled';
          notifMessage = `Your appointment is rescheduled to ${new Date(result.scheduledAt).toLocaleString()}.`;
        } else if (status === 'COMPLETED') {
          notifTitle = 'Consultation Completed';
          notifMessage = `Your visit with Dr. ${appointment.doctor?.profile?.fullName || 'the doctor'} was marked completed. Clinical summary is updated.`;
        } else if (status === 'MISSED') {
          notifTitle = 'Appointment Missed';
          notifMessage = `You missed your scheduled consultation on ${new Date(appointment.scheduledAt).toLocaleDateString()}. Please reschedule.`;
        } else if (status === 'CANCELLED') {
          notifTitle = 'Appointment Cancelled';
          notifMessage = `Your appointment on ${new Date(appointment.scheduledAt).toLocaleDateString()} was cancelled. Reason: ${updateData.cancellationReason}`;
        }

        // Notify patient
        await tx.careNotification.create({
          data: {
            userId: appointment.patientId,
            patientId: appointment.patientId,
            actorId: actor.id,
            type: 'APPOINTMENT_UPDATE',
            category: 'APPOINTMENT',
            title: notifTitle,
            message: notifMessage,
            link: '/appointments',
          },
        }).catch(() => {});

        // If patient cancelled or rescheduled, notify doctor
        if (!actor.isClinician) {
          await tx.careNotification.create({
            data: {
              userId: appointment.doctorId,
              patientId: appointment.patientId,
              actorId: actor.id,
              type: 'APPOINTMENT_UPDATE',
              category: 'APPOINTMENT',
              title: `Patient ${notifTitle}`,
              message: `${appointment.patient?.profile?.fullName || 'Patient'} has ${status.toLowerCase()} their appointment for ${new Date(result.scheduledAt).toLocaleDateString()}.`,
              link: '/doctor/appointments',
            },
          }).catch(() => {});
        }

        return result;
      });

      res.json({
        appointment: presentAppointment(updated),
      });
    } catch (error) {
      respondWithError(res, error, 'Unable to update appointment status.');
    }
  },
);

// =========================================================================
// PHASE 4: DOCTOR COMMAND CENTER, CAREGIVER CONNECT & CARE COORDINATION
// =========================================================================

const assignTaskSchema = z.object({
  patientId: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  category: z.enum(['FOLLOW_UP', 'BLOOD_SUGAR_CHECK', 'MEDICATION', 'LAB_TEST', 'LIFESTYLE']).optional(),
  dueAt: z.string().datetime({ offset: true }),
}).strict();

const clinicalReviewSchema = z.object({
  patientId: z.string().uuid(),
  reviewNotes: z.string().trim().min(5).max(4000),
  nextReviewDate: z.string().datetime({ offset: true }).optional(),
  updateTargetFastingMin: z.number().min(60).max(180).optional(),
  updateTargetFastingMax: z.number().min(90).max(250).optional(),
}).strict();

const requestAccessSchema = z.object({
  patientId: z.string().uuid(),
  requestedPermissions: z.array(z.string()).min(1),
  reason: z.string().trim().max(500).optional(),
}).strict();

const sendMessageSchema = z.object({
  patientId: z.string().uuid(),
  category: z.enum(['QUESTION', 'DOCTOR_RESPONSE', 'CAREGIVER_UPDATE', 'FOLLOW_UP_INSTRUCTION', 'APPOINTMENT', 'GENERAL']).default('GENERAL'),
  content: z.string().trim().min(1).max(2000),
  recipientId: z.string().uuid().optional(),
}).strict();

async function verifyDoctorAssignment(doctorId: string, patientId: string): Promise<boolean> {
  const assignment = await prisma.doctorPatientAssignment.findUnique({
    where: { doctorId_patientId: { doctorId, patientId } },
  });
  return assignment?.status === 'ACTIVE';
}

async function canAccessPatientFeedOrMessages(
  actor: { id: string; email: string; isClinician: boolean },
  patientId: string,
): Promise<{
  allowed: boolean;
  role: 'PATIENT' | 'DOCTOR' | 'CAREGIVER';
  reason?: string;
  permissions: string[];
}> {
  if (actor.id === patientId) {
    return { allowed: true, role: 'PATIENT', permissions: [] };
  }

  if (actor.isClinician) {
    const isAssigned = await verifyDoctorAssignment(actor.id, patientId);
    if (isAssigned) {
      return { allowed: true, role: 'DOCTOR', permissions: [] };
    }
    return { allowed: false, role: 'DOCTOR', reason: 'You are not the assigned clinician for this patient.', permissions: [] };
  }

  const consent = await activeConsent(patientId, actor.email);
  if (consent) {
    return {
      allowed: true,
      role: 'CAREGIVER',
      permissions: parsePermissions(consent.permissions),
    };
  }

  return { allowed: false, role: 'CAREGIVER', reason: 'You do not have authorized caregiver access to this patient.', permissions: [] };
}

// ------------------------------------------------------
// 1. GET /api/coordination/doctor/dashboard
// Command Center for authorized doctors.
// ------------------------------------------------------
router.get(
  '/doctor/dashboard',
  requireClinician,
  async (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase().trim() : '';
      const riskFilter = typeof req.query.risk === 'string' ? req.query.risk.toUpperCase() : 'ALL';
      const sortBy = typeof req.query.sort === 'string' ? req.query.sort.toUpperCase() : 'NAME';

      // Fetch active doctor-patient assignments
      const assignments = await prisma.doctorPatientAssignment.findMany({
        where: {
          doctorId: actor.id,
          status: 'ACTIVE',
        },
        include: {
          patient: {
            include: {
              profile: true,
              observations: {
                orderBy: { observedAt: 'desc' },
                take: 5,
              },
              carePlansAsPatient: {
                where: { status: 'ACTIVE' },
                orderBy: { version: 'desc' },
                take: 1,
                include: {
                  goals: true,
                  activities: true,
                },
              },
              appointmentsAsPatient: {
                where: {
                  doctorId: actor.id,
                  scheduledAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                  status: { in: ['REQUESTED', 'CONFIRMED'] },
                },
                orderBy: { scheduledAt: 'asc' },
                take: 1,
              },
              tasks: {
                where: {
                  createdAt: { gte: new Date(Date.now() - 14 * 86400000) },
                },
              },
            },
          },
        },
        orderBy: { activatedAt: 'desc' },
      });

      // Fetch doctor's upcoming appointments
      const upcomingAppointments = await prisma.appointment.findMany({
        where: {
          doctorId: actor.id,
          scheduledAt: { gte: new Date() },
          status: { in: ['REQUESTED', 'CONFIRMED'] },
        },
        include: appointmentInclude,
        orderBy: { scheduledAt: 'asc' },
        take: 10,
      });

      // Transform patient items
      let patients = assignments.map((asgn) => {
        const p = asgn.patient;
        const latestObs = p.observations[0] || null;
        const activePlan = p.carePlansAsPatient[0] || null;
        const nextAppt = p.appointmentsAsPatient[0] || null;

        let risk: 'HIGH' | 'LOW' | 'IN_TARGET' | 'UNKNOWN' = 'UNKNOWN';
        if (latestObs) {
          if (latestObs.numericValue > (p.profile?.targetPostMealMax || 180) || latestObs.numericValue < 70) {
            risk = 'HIGH';
          } else if (latestObs.numericValue >= (p.profile?.targetFastingMin || 70) && latestObs.numericValue <= (p.profile?.targetPostMealMax || 180)) {
            risk = 'IN_TARGET';
          } else if (latestObs.numericValue < 70) {
            risk = 'LOW';
          }
        }

        const isReviewOverdue = Boolean(activePlan?.reviewDate && new Date(activePlan.reviewDate).getTime() < Date.now());

        const totalTasks = p.tasks.length;
        const completedTasks = p.tasks.filter((t) => t.status === 'COMPLETED').length;
        const adherenceRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

        let currentStage = 'Daily Monitoring';
        if (!p.profile) currentStage = 'Onboarding';
        else if (p.observations.length === 0) currentStage = 'Initial Assessment';
        else if (!activePlan) currentStage = 'Care Plan Pending';
        else if (isReviewOverdue) currentStage = 'Doctor Follow-up (Overdue)';
        else if (nextAppt) currentStage = 'Follow-up Scheduled';

        return {
          patientId: p.id,
          name: p.profile?.fullName || p.email,
          email: p.email,
          diabetesType: p.profile?.diabetesType || 'UNKNOWN',
          diagnosisYear: p.profile?.diagnosisYear || null,
          targetFastingMin: p.profile?.targetFastingMin || 80,
          targetFastingMax: p.profile?.targetFastingMax || 130,
          targetPostMealMax: p.profile?.targetPostMealMax || 180,
          assignedAt: asgn.activatedAt,
          risk,
          isReviewOverdue,
          currentStage,
          adherenceRate,
          latestObservation: latestObs
            ? {
                id: latestObs.id,
                numericValue: latestObs.numericValue,
                unit: latestObs.unit,
                context: latestObs.context,
                observedAt: latestObs.observedAt.toISOString(),
                isHigh: latestObs.numericValue > 180,
                isLow: latestObs.numericValue < 70,
              }
            : null,
          activeCarePlan: activePlan
            ? {
                id: activePlan.id,
                title: activePlan.title,
                version: activePlan.version,
                reviewDate: activePlan.reviewDate ? activePlan.reviewDate.toISOString() : null,
                goalsCount: activePlan.goals.length,
                activitiesCount: activePlan.activities.length,
              }
            : null,
          nextAppointment: nextAppt
            ? {
                id: nextAppt.id,
                scheduledAt: nextAppt.scheduledAt.toISOString(),
                visitType: nextAppt.visitType,
                status: nextAppt.status,
                isServerConfirmed: nextAppt.status === 'CONFIRMED',
              }
            : null,
        };
      });

      // Search filtering
      if (search) {
        patients = patients.filter(
          (p) =>
            p.name.toLowerCase().includes(search) ||
            p.email.toLowerCase().includes(search) ||
            p.diabetesType.toLowerCase().includes(search)
        );
      }

      // Risk filtering
      if (riskFilter !== 'ALL') {
        patients = patients.filter((p) => p.risk === riskFilter);
      }

      // Sorting
      patients.sort((a, b) => {
        if (sortBy === 'NAME') return a.name.localeCompare(b.name);
        if (sortBy === 'RISK') {
          const order = { HIGH: 0, LOW: 1, IN_TARGET: 2, UNKNOWN: 3 };
          return order[a.risk] - order[b.risk];
        }
        if (sortBy === 'NEXT_VISIT') {
          const timeA = a.nextAppointment ? new Date(a.nextAppointment.scheduledAt).getTime() : Infinity;
          const timeB = b.nextAppointment ? new Date(b.nextAppointment.scheduledAt).getTime() : Infinity;
          return timeA - timeB;
        }
        if (sortBy === 'RECENT_OBS') {
          const timeA = a.latestObservation ? new Date(a.latestObservation.observedAt).getTime() : 0;
          const timeB = b.latestObservation ? new Date(b.latestObservation.observedAt).getTime() : 0;
          return timeB - timeA;
        }
        return 0;
      });

      res.json({
        summary: {
          totalAssignedPatients: assignments.length,
          highRiskCount: patients.filter((p) => p.risk === 'HIGH').length,
          overdueFollowUpsCount: patients.filter((p) => p.isReviewOverdue).length,
          upcomingAppointmentsCount: upcomingAppointments.length,
        },
        patients,
        upcomingAppointments: upcomingAppointments.map((a) => presentAppointment(a)),
      });
    } catch (error) {
      respondWithError(res, error, 'Unable to load doctor command center dashboard.');
    }
  },
);

// ------------------------------------------------------
// 2. POST /api/coordination/doctor/assign-task
// Clinician assigns follow-up task to assigned patient.
// ------------------------------------------------------
router.post(
  '/doctor/assign-task',
  requireClinician,
  async (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const input = assignTaskSchema.parse(req.body);

      const isAssigned = await verifyDoctorAssignment(actor.id, input.patientId);
      if (!isAssigned) {
        res.status(403).json({ error: 'Forbidden: You can only assign tasks to active assigned patients.' });
        return;
      }

      const task = await prisma.$transaction(async (tx) => {
        const created = await tx.careTask.create({
          data: {
            userId: input.patientId,
            title: input.title,
            category: input.category || 'FOLLOW_UP',
            status: 'PENDING',
            dueAt: new Date(input.dueAt),
            completedById: null,
            completedByRole: null,
          },
        });

        await tx.careNotification.create({
          data: {
            userId: input.patientId,
            patientId: input.patientId,
            actorId: actor.id,
            type: 'TASK_ASSIGNED',
            title: 'New Clinical Task Assigned',
            message: `Your doctor has assigned a new task: "${input.title}".`,
            link: '/tasks',
          },
        });

        await tx.auditLog.create({
          data: {
            userId: input.patientId,
            actorId: actor.id,
            action: 'DOCTOR_ASSIGNED_TASK',
            entityType: 'CareTask',
            entityId: created.id,
            metadata: JSON.stringify({ title: input.title, dueAt: input.dueAt }),
            ipAddress: req.ip,
            userAgent: req.get('user-agent') ?? null,
          },
        });

        return created;
      });

      res.status(201).json({ task });
    } catch (error) {
      respondWithError(res, error, 'Unable to assign task.');
    }
  },
);

// ------------------------------------------------------
// 3. POST /api/coordination/doctor/clinical-review
// Clinician records clinical review and updates follow-up date.
// ------------------------------------------------------
router.post(
  '/doctor/clinical-review',
  requireClinician,
  async (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const input = clinicalReviewSchema.parse(req.body);

      const isAssigned = await verifyDoctorAssignment(actor.id, input.patientId);
      if (!isAssigned) {
        res.status(403).json({ error: 'Forbidden: You can only record clinical reviews for active assigned patients.' });
        return;
      }

      const review = await prisma.$transaction(async (tx) => {
        if (input.updateTargetFastingMin !== undefined || input.updateTargetFastingMax !== undefined) {
          await tx.patientProfile.updateMany({
            where: { userId: input.patientId },
            data: {
              ...(input.updateTargetFastingMin !== undefined ? { targetFastingMin: input.updateTargetFastingMin } : {}),
              ...(input.updateTargetFastingMax !== undefined ? { targetFastingMax: input.updateTargetFastingMax } : {}),
            },
          });
        }

        if (input.nextReviewDate) {
          await tx.carePlan.updateMany({
            where: { patientId: input.patientId, status: 'ACTIVE' },
            data: { reviewDate: new Date(input.nextReviewDate) },
          });
        }

        await tx.careNotification.create({
          data: {
            userId: input.patientId,
            patientId: input.patientId,
            actorId: actor.id,
            type: 'FOLLOW_UP_DUE',
            title: 'Clinical Review Recorded',
            message: 'Your doctor has recorded a clinical review note. Open AarogyaDamu to view details.',
            link: '/journey',
          },
        });

        await tx.auditLog.create({
          data: {
            userId: input.patientId,
            actorId: actor.id,
            action: 'CLINICAL_REVIEW_RECORDED',
            entityType: 'User',
            entityId: input.patientId,
            metadata: JSON.stringify({
              reviewNotes: input.reviewNotes,
              nextReviewDate: input.nextReviewDate,
              targetsUpdated: input.updateTargetFastingMin !== undefined || input.updateTargetFastingMax !== undefined,
            }),
            ipAddress: req.ip,
            userAgent: req.get('user-agent') ?? null,
          },
        });

        return {
          patientId: input.patientId,
          reviewNotes: input.reviewNotes,
          nextReviewDate: input.nextReviewDate,
          reviewedAt: new Date().toISOString(),
        };
      });

      res.status(201).json({ review });
    } catch (error) {
      respondWithError(res, error, 'Unable to record clinical review.');
    }
  },
);

// ------------------------------------------------------
// 4. GET /api/coordination/caregiver/dependents/:patientId/activities
// Permitted care plan activities for caregiver delegation.
// ------------------------------------------------------
router.get(
  '/caregiver/dependents/:patientId/activities',
  async (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const { patientId } = req.params;
      const consent = await activeConsent(patientId, actor.email);
      if (!consent) {
        res.status(403).json({ error: 'Forbidden: No active caregiver consent for this patient.' });
        return;
      }

      const activePlan = await prisma.carePlan.findFirst({
        where: { patientId, status: 'ACTIVE' },
        include: {
          activities: {
            where: { isCaregiverEligible: true },
          },
          goals: true,
        },
        orderBy: { version: 'desc' },
      });

      res.json({
        patientId,
        hasActiveCarePlan: Boolean(activePlan),
        planTitle: activePlan?.title || null,
        permittedActivities: activePlan?.activities || [],
        goals: activePlan?.goals || [],
      });
    } catch (error) {
      respondWithError(res, error, 'Unable to load caregiver activities.');
    }
  },
);

// ------------------------------------------------------
// 5. GET /api/coordination/caregiver/dependents/:patientId/history
// Task completion history showing delegated completions.
// ------------------------------------------------------
router.get(
  '/caregiver/dependents/:patientId/history',
  async (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const { patientId } = req.params;
      const consent = await activeConsent(patientId, actor.email);
      if (!consent) {
        res.status(403).json({ error: 'Forbidden: No active caregiver consent for this patient.' });
        return;
      }

      const completedTasks = await prisma.careTask.findMany({
        where: {
          userId: patientId,
          status: 'COMPLETED',
        },
        include: {
          completedBy: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true } },
            },
          },
        },
        orderBy: { completedAt: 'desc' },
        take: 50,
      });

      res.json({
        history: completedTasks.map((t) => ({
          id: t.id,
          title: t.title,
          category: t.category,
          completedAt: t.completedAt ? t.completedAt.toISOString() : null,
          completedById: t.completedById,
          completedByRole: t.completedByRole || 'PATIENT',
          completedByName:
            t.completedBy?.profile?.fullName ||
            t.completedBy?.email ||
            (t.completedByRole === 'CAREGIVER' ? 'Authorized Caregiver' : 'Patient Self'),
        })),
      });
    } catch (error) {
      respondWithError(res, error, 'Unable to load task completion history.');
    }
  },
);

// ------------------------------------------------------
// 6. POST /api/coordination/caregiver/request-access
// Caregiver requests additional permissions from patient.
// ------------------------------------------------------
router.post(
  '/caregiver/request-access',
  async (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const input = requestAccessSchema.parse(req.body);

      const patient = await prisma.user.findUnique({
        where: { id: input.patientId },
        include: { profile: true },
      });
      if (!patient) {
        res.status(404).json({ error: 'Patient not found.' });
        return;
      }

      await prisma.careNotification.create({
        data: {
          userId: input.patientId,
          patientId: input.patientId,
          actorId: actor.id,
          type: 'ACCESS_REQUEST',
          title: 'Caregiver Access Request',
          message: `${actor.email} is requesting caregiver permissions: ${input.requestedPermissions.join(', ')}.${input.reason ? ` Note: "${input.reason}"` : ''}`,
          link: '/profile',
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: input.patientId,
          actorId: actor.id,
          action: 'CAREGIVER_ACCESS_REQUESTED',
          entityType: 'CaregiverConsent',
          metadata: JSON.stringify({
            requestedPermissions: input.requestedPermissions,
            caregiverEmail: actor.email,
            reason: input.reason,
          }),
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Access request successfully sent to the patient.',
      });
    } catch (error) {
      respondWithError(res, error, 'Unable to submit access request.');
    }
  },
);

// ------------------------------------------------------
// 7. GET /api/coordination/activity-feed
// Chronological unified patient activity feed.
// ------------------------------------------------------
router.get('/activity-feed', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const requestedPatientId = typeof req.query.patientId === 'string' ? req.query.patientId : actor.id;
    const filterType = typeof req.query.type === 'string' ? req.query.type.toUpperCase() : 'ALL';
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const access = await canAccessPatientFeedOrMessages(actor, requestedPatientId);
    if (!access.allowed) {
      res.status(403).json({ error: access.reason || 'Forbidden: Access to this patient feed is denied.' });
      return;
    }

    const caregiverPermissions = access.permissions || [];
    const canViewObservations = access.role !== 'CAREGIVER' || caregiverPermissions.includes('VIEW_OBSERVATIONS');
    const canViewTasks = access.role !== 'CAREGIVER' || caregiverPermissions.includes('VIEW_TASKS') || caregiverPermissions.includes('MANAGE_TASKS');
    const canViewCarePlan = access.role !== 'CAREGIVER' || caregiverPermissions.includes('VIEW_CARE_PLAN') || caregiverPermissions.includes('VIEW_TASKS') || caregiverPermissions.includes('MANAGE_TASKS');
    const canViewConsultations = access.role !== 'CAREGIVER' || caregiverPermissions.includes('VIEW_CONSULTATIONS') || caregiverPermissions.includes('MANAGE_CONSULTATIONS');
    const canViewMessages = true;
    const canViewConsents = access.role !== 'CAREGIVER';

    const [observations, tasks, carePlans, appointments, consultationNotes, messages, consents] = await Promise.all([
      canViewObservations && (filterType === 'ALL' || filterType === 'OBSERVATIONS')
        ? prisma.healthObservation.findMany({
            where: { userId: requestedPatientId },
            orderBy: { observedAt: 'desc' },
            take: limit,
          })
        : [],
      canViewTasks && (filterType === 'ALL' || filterType === 'TASKS')
        ? prisma.careTask.findMany({
            where: { userId: requestedPatientId, status: 'COMPLETED' },
            include: { completedBy: { select: { email: true, profile: { select: { fullName: true } } } } },
            orderBy: { completedAt: 'desc' },
            take: limit,
          })
        : [],
      canViewCarePlan && (filterType === 'ALL' || filterType === 'CARE_PLAN')
        ? prisma.carePlan.findMany({
            where: { patientId: requestedPatientId },
            include: { doctor: { select: { profile: { select: { fullName: true } } } } },
            orderBy: { updatedAt: 'desc' },
            take: limit,
          })
        : [],
      canViewConsultations && (filterType === 'ALL' || filterType === 'APPOINTMENTS')
        ? prisma.appointment.findMany({
            where: { patientId: requestedPatientId },
            include: { doctor: { select: { profile: { select: { fullName: true } } } } },
            orderBy: { createdAt: 'desc' },
            take: limit,
          })
        : [],
      canViewConsultations && (filterType === 'ALL' || filterType === 'CLINICAL')
        ? prisma.consultationNote.findMany({
            where: { userId: requestedPatientId, status: 'APPROVED' },
            orderBy: { approvedAt: 'desc' },
            take: limit,
          })
        : [],
      canViewMessages && (filterType === 'ALL' || filterType === 'MESSAGES')
        ? prisma.careTeamMessage.findMany({
            where: { patientId: requestedPatientId },
            include: { sender: { select: { email: true, profile: { select: { fullName: true } } } } },
            orderBy: { createdAt: 'desc' },
            take: limit,
          })
        : [],
      canViewConsents && (filterType === 'ALL' || filterType === 'CAREGIVER')
        ? prisma.caregiverConsent.findMany({
            where: { patientId: requestedPatientId },
            orderBy: { createdAt: 'desc' },
            take: limit,
          })
        : [],
    ]);

    const feed: any[] = [];

    observations.forEach((o) => {
      feed.push({
        id: `obs-${o.id}`,
        type: 'OBSERVATION',
        title: `Blood Glucose: ${o.numericValue} ${o.unit}`,
        details: `Context: ${o.context.toLowerCase().replace(/_/g, ' ')}`,
        timestamp: o.observedAt.toISOString(),
        actorName: 'Patient Self',
        status: o.numericValue > 180 ? 'HIGH' : o.numericValue < 70 ? 'LOW' : 'IN_TARGET',
      });
    });

    tasks.forEach((t) => {
      feed.push({
        id: `task-${t.id}`,
        type: 'TASK_COMPLETED',
        title: `Completed Task: ${t.title}`,
        details:
          t.completedByRole === 'CAREGIVER'
            ? `Completed on behalf of patient by ${t.completedBy?.profile?.fullName || t.completedBy?.email || 'Caregiver'}`
            : 'Completed by Patient Self',
        timestamp: (t.completedAt || t.updatedAt).toISOString(),
        actorName:
          t.completedBy?.profile?.fullName || (t.completedByRole === 'CAREGIVER' ? 'Authorized Caregiver' : 'Patient Self'),
        status: 'COMPLETED',
      });
    });

    carePlans.forEach((p) => {
      feed.push({
        id: `plan-${p.id}`,
        type: 'CARE_PLAN',
        title: `Care Plan v${p.version} (${p.status})`,
        details: `Care plan managed by Dr. ${p.doctor?.profile?.fullName || 'Doctor'}. ${p.summary || ''}`,
        timestamp: p.updatedAt.toISOString(),
        actorName: `Dr. ${p.doctor?.profile?.fullName || 'Clinician'}`,
        status: p.status,
      });
    });

    appointments.forEach((a) => {
      feed.push({
        id: `appt-${a.id}`,
        type: 'APPOINTMENT',
        title: `${a.visitType} Visit (${a.status})`,
        details: `Visit with Dr. ${a.doctor?.profile?.fullName || 'Doctor'} on ${new Date(a.scheduledAt).toLocaleDateString()}. Reason: ${a.reason}`,
        timestamp: a.createdAt.toISOString(),
        actorName: 'Care Coordination',
        status: a.status,
      });
    });

    consultationNotes.forEach((s) => {
      feed.push({
        id: `note-${s.id}`,
        type: 'CLINICAL',
        title: `Doctor Consultation Note (${s.clinicianName})`,
        details: s.approvedNoteText || 'Approved consultation note',
        timestamp: (s.approvedAt || s.createdAt).toISOString(),
        actorName: s.clinicianName,
        status: 'APPROVED',
      });
    });

    messages.forEach((m) => {
      feed.push({
        id: `msg-${m.id}`,
        type: 'MESSAGE',
        title: `Care Team Message: ${m.category}`,
        details: m.content,
        timestamp: m.createdAt.toISOString(),
        actorName: m.sender?.profile?.fullName || m.senderRole,
        status: m.senderRole,
      });
    });

    consents.forEach((c) => {
      feed.push({
        id: `consent-${c.id}`,
        type: 'CAREGIVER',
        title: `Caregiver Access: ${c.caregiverName}`,
        details: `Status: ${c.status}. Relationship: ${c.relationship}. Permissions: ${c.permissions}`,
        timestamp: c.createdAt.toISOString(),
        actorName: 'Patient Consent',
        status: c.status,
      });
    });

    feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      patientId: requestedPatientId,
      totalActivities: feed.length,
      feed: feed.slice(0, limit),
    });
  } catch (error) {
    respondWithError(res, error, 'Unable to load activity feed.');
  }
});

// ------------------------------------------------------
// 8. CARE TEAM MESSAGING (GET, POST, PATCH /read)
// ------------------------------------------------------
router.get('/messages', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : actor.id;

    const access = await canAccessPatientFeedOrMessages(actor, patientId);
    if (!access.allowed) {
      res.status(403).json({ error: access.reason || 'Forbidden: Access to messages is denied.' });
      return;
    }

    const messages = await prisma.careTeamMessage.findMany({
      where: { patientId },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            isClinician: true,
            profile: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      patientId,
      messages: messages.map((m) => ({
        id: m.id,
        patientId: m.patientId,
        senderId: m.senderId,
        senderName: m.sender?.profile?.fullName || m.sender?.email || m.senderRole,
        senderRole: m.senderRole,
        category: m.category,
        content: m.content,
        isRead: m.isRead,
        readAt: m.readAt ? m.readAt.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
        isOwnMessage: m.senderId === actor.id,
      })),
    });
  } catch (error) {
    respondWithError(res, error, 'Unable to load care team messages.');
  }
});

router.post('/messages', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const input = sendMessageSchema.parse(req.body);

    const access = await canAccessPatientFeedOrMessages(actor, input.patientId);
    if (!access.allowed) {
      res.status(403).json({ error: access.reason || 'Forbidden: You cannot post messages to this patient team.' });
      return;
    }

    const senderRole = access.role;

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.careTeamMessage.create({
        data: {
          patientId: input.patientId,
          senderId: actor.id,
          recipientId: input.recipientId || null,
          senderRole,
          category: input.category,
          content: input.content,
        },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true } },
            },
          },
        },
      });

      const recipientsToNotify: string[] = [];
      if (senderRole === 'DOCTOR') {
        recipientsToNotify.push(input.patientId);
      } else if (senderRole === 'PATIENT') {
        const assignments = await tx.doctorPatientAssignment.findMany({
          where: { patientId: input.patientId, status: 'ACTIVE' },
        });
        assignments.forEach((a) => recipientsToNotify.push(a.doctorId));
      } else if (senderRole === 'CAREGIVER') {
        recipientsToNotify.push(input.patientId);
        const assignments = await tx.doctorPatientAssignment.findMany({
          where: { patientId: input.patientId, status: 'ACTIVE' },
        });
        assignments.forEach((a) => recipientsToNotify.push(a.doctorId));
      }

      const uniqueRecipients = Array.from(new Set(recipientsToNotify));

      for (const recId of uniqueRecipients) {
        if (recId !== actor.id) {
          await tx.careNotification.create({
            data: {
              userId: recId,
              patientId: input.patientId,
              actorId: actor.id,
              type: senderRole === 'DOCTOR' ? 'DOCTOR_MESSAGE' : 'CAREGIVER_UPDATE',
              title: senderRole === 'DOCTOR' ? 'Message from Doctor' : 'Care Team Update',
              message: `${created.sender?.profile?.fullName || actor.email}: "${input.content.slice(0, 100)}${input.content.length > 100 ? '...' : ''}"`,
              link: '/messages',
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: input.patientId,
          actorId: actor.id,
          action: 'CARE_TEAM_MESSAGE_SENT',
          entityType: 'CareTeamMessage',
          entityId: created.id,
          metadata: JSON.stringify({ category: input.category, senderRole }),
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      });

      return created;
    });

    res.status(201).json({
      message: {
        id: message.id,
        patientId: message.patientId,
        senderId: message.senderId,
        senderName: message.sender?.profile?.fullName || actor.email,
        senderRole: message.senderRole,
        category: message.category,
        content: message.content,
        isRead: message.isRead,
        createdAt: message.createdAt.toISOString(),
      },
    });
  } catch (error) {
    respondWithError(res, error, 'Unable to send message.');
  }
});

router.patch('/messages/:id/read', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { id } = req.params;
    const msg = await prisma.careTeamMessage.findUnique({ where: { id } });
    if (!msg) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }

    const access = await canAccessPatientFeedOrMessages(actor, msg.patientId);
    if (!access.allowed) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }

    const updated = await prisma.careTeamMessage.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });

    res.json({ success: true, message: updated });
  } catch (error) {
    respondWithError(res, error, 'Unable to update message read status.');
  }
});

// ------------------------------------------------------
// 9. CARE NOTIFICATIONS (GET, PATCH /read, POST /read-all)
// ------------------------------------------------------
router.get('/notifications', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const notifications = await prisma.careNotification.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    res.json({
      unreadCount,
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        isRead: n.isRead,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    respondWithError(res, error, 'Unable to load notifications.');
  }
});

router.patch('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { id } = req.params;
    const notification = await prisma.careNotification.findFirst({
      where: { id, userId: actor.id },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }

    const updated = await prisma.careNotification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });

    res.json({ success: true, notification: updated });
  } catch (error) {
    respondWithError(res, error, 'Unable to mark notification as read.');
  }
});

router.post('/notifications/read-all', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    await prisma.careNotification.updateMany({
      where: { userId: actor.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    respondWithError(res, error, 'Unable to mark all notifications as read.');
  }
});

export default router;
