import { PrismaClient } from '@prisma/client';
import { logAuditEvent } from '../audit/auditLogger';

export type AppointmentState =
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'COMPLETED'
  | 'MISSED'
  | 'RESCHEDULED'
  | 'CANCELLED';

export const ALLOWED_CLINICIAN_TRANSITIONS: Record<AppointmentState, AppointmentState[]> = {
  REQUESTED: ['CONFIRMED', 'DECLINED', 'RESCHEDULED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'MISSED', 'RESCHEDULED', 'CANCELLED'],
  RESCHEDULED: ['CONFIRMED', 'CANCELLED'],
  DECLINED: [],
  COMPLETED: [],
  MISSED: [],
  CANCELLED: [],
};

export const ALLOWED_PATIENT_TRANSITIONS: Record<AppointmentState, AppointmentState[]> = {
  REQUESTED: ['CANCELLED', 'RESCHEDULED'],
  CONFIRMED: ['CANCELLED', 'RESCHEDULED'],
  RESCHEDULED: ['CANCELLED', 'RESCHEDULED'],
  DECLINED: [],
  COMPLETED: [],
  MISSED: [],
  CANCELLED: [],
};

export interface AppointmentTransitionActor {
  id: string;
  isClinician: boolean;
  email?: string;
}

export interface TransitionAppointmentParams {
  appointmentId: string;
  targetStatus: AppointmentState;
  actor: AppointmentTransitionActor;
  rejectionReason?: string;
  cancellationReason?: string;
  newScheduledAt?: Date | string;
  newDurationMinutes?: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  bypassRoleCheck?: boolean; // For automated system jobs or internal transactional triggers
}

export class AppointmentTransitionError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string = 'INVALID_TRANSITION', status: number = 409) {
    super(message);
    this.name = 'AppointmentTransitionError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Validates whether a state transition is legal according to role permissions.
 */
export function validateAppointmentTransition(
  currentStatus: string,
  targetStatus: string,
  isClinician: boolean,
): { valid: boolean; reason?: string } {
  const current = currentStatus as AppointmentState;
  const target = targetStatus as AppointmentState;

  const matrix = isClinician ? ALLOWED_CLINICIAN_TRANSITIONS : ALLOWED_PATIENT_TRANSITIONS;
  const allowedNext = matrix[current];

  if (!allowedNext) {
    return {
      valid: false,
      reason: `Unknown or unhandled appointment status: ${currentStatus}`,
    };
  }

  if (!allowedNext.includes(target)) {
    return {
      valid: false,
      reason: `Transition from ${currentStatus} to ${targetStatus} is not allowed for ${
        isClinician ? 'clinicians' : 'patients/caregivers'
      }.`,
    };
  }

  return { valid: true };
}

/**
 * Executes an atomic appointment status transition inside a Prisma transaction.
 */
export async function transitionAppointmentStatus(
  tx: any, // Prisma TransactionClient
  params: TransitionAppointmentParams,
) {
  const {
    appointmentId,
    targetStatus,
    actor,
    rejectionReason,
    cancellationReason,
    newScheduledAt,
    newDurationMinutes,
    ipAddress,
    userAgent,
    bypassRoleCheck,
  } = params;

  // 1. Fetch existing appointment
  const appointment = await tx.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: {
        select: {
          id: true,
          email: true,
          profile: { select: { fullName: true } },
        },
      },
      doctor: {
        select: {
          id: true,
          email: true,
          profile: { select: { fullName: true } },
        },
      },
    },
  });

  if (!appointment) {
    throw new AppointmentTransitionError('Appointment not found', 'APPOINTMENT_NOT_FOUND', 404);
  }

  // 2. Validate current state vs target state
  if (appointment.status === targetStatus) {
    // Idempotent: already at target status
    return appointment;
  }

  if (!bypassRoleCheck) {
    // Verify actor relationship
    if (actor.isClinician) {
      if (appointment.doctorId !== actor.id) {
        throw new AppointmentTransitionError(
          'You cannot change another doctor’s appointment.',
          'FORBIDDEN',
          403,
        );
      }
    }

    const check = validateAppointmentTransition(appointment.status, targetStatus, actor.isClinician);
    if (!check.valid) {
      throw new AppointmentTransitionError(
        check.reason || 'That appointment status transition is not allowed.',
        'INVALID_APPOINTMENT_TRANSITION',
        409,
      );
    }
  }

  // 3. Handle status-specific preconditions
  if (targetStatus === 'MISSED') {
    if (new Date(appointment.scheduledAt).getTime() > Date.now()) {
      throw new AppointmentTransitionError(
        'Future appointments cannot be marked as missed. Only past or elapsed visits can be marked as missed (no-show).',
        'FUTURE_APPOINTMENT_CANNOT_BE_MISSED',
        400,
      );
    }
  }

  let parsedNewScheduledAt: Date | undefined;
  if (targetStatus === 'RESCHEDULED') {
    if (!newScheduledAt) {
      throw new AppointmentTransitionError(
        'A new scheduled time (newScheduledAt) is required to reschedule.',
        'MISSING_NEW_TIME',
        400,
      );
    }
    parsedNewScheduledAt = new Date(newScheduledAt);
    if (parsedNewScheduledAt.getTime() < Date.now() + 60_000) {
      throw new AppointmentTransitionError(
        'New appointment time must be in the future.',
        'PAST_TIME_NOT_ALLOWED',
        400,
      );
    }

    // Check collision
    const duration = newDurationMinutes ?? appointment.durationMinutes;
    const end = new Date(parsedNewScheduledAt.getTime() + duration * 60000);

    const candidates = await tx.appointment.findMany({
      where: {
        doctorId: appointment.doctorId,
        id: { not: appointment.id },
        status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'] },
        scheduledAt: { lt: end },
      },
      select: { id: true, scheduledAt: true, durationMinutes: true },
    });

    const hasOverlap = candidates.some((c: any) => {
      const cEnd = new Date(c.scheduledAt.getTime() + c.durationMinutes * 60000);
      return parsedNewScheduledAt!.getTime() < cEnd.getTime() && c.scheduledAt.getTime() < end.getTime();
    });

    if (hasOverlap) {
      throw new AppointmentTransitionError(
        'Doctor already has an overlapping appointment in this time slot.',
        'APPOINTMENT_OVERLAP',
        409,
      );
    }

    const timeOff = await tx.doctorTimeOff.findFirst({
      where: {
        doctorId: appointment.doctorId,
        startDate: { lte: end },
        endDate: { gte: parsedNewScheduledAt },
      },
    });

    if (timeOff) {
      throw new AppointmentTransitionError(
        'Doctor is on leave during this requested time.',
        'DOCTOR_ON_LEAVE',
        409,
      );
    }
  }

  // 4. Construct update payload
  const updateData: any = { status: targetStatus };

  if (targetStatus === 'DECLINED') {
    updateData.rejectionReason = rejectionReason || 'Declined by doctor';
  } else if (targetStatus === 'CANCELLED') {
    updateData.cancellationReason =
      cancellationReason || (actor.isClinician ? 'Cancelled by doctor' : 'Cancelled by patient');
  } else if (targetStatus === 'COMPLETED') {
    updateData.completedAt = new Date();
  }

  if (parsedNewScheduledAt) {
    updateData.scheduledAt = parsedNewScheduledAt;
    if (newDurationMinutes) {
      updateData.durationMinutes = newDurationMinutes;
    }
  }

  // 5. Update appointment
  const updated = await tx.appointment.update({
    where: { id: appointment.id },
    data: updateData,
    include: {
      patient: {
        select: {
          id: true,
          email: true,
          profile: { select: { fullName: true } },
        },
      },
      doctor: {
        select: {
          id: true,
          email: true,
          profile: { select: { fullName: true } },
        },
      },
    },
  });

  // 6. Handle side effects (assignments on confirmation)
  if (targetStatus === 'CONFIRMED') {
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

  // 7. Audit logging
  await logAuditEvent({
    userId: appointment.patientId,
    actorId: actor.id,
    action: `APPOINTMENT_${targetStatus}`,
    entityType: 'Appointment',
    entityId: appointment.id,
    metadata: {
      previousStatus: appointment.status,
      newStatus: targetStatus,
      rejectionReason: updateData.rejectionReason,
      cancellationReason: updateData.cancellationReason,
      newScheduledAt: parsedNewScheduledAt ? parsedNewScheduledAt.toISOString() : undefined,
    },
    ipAddress: ipAddress || undefined,
    userAgent: userAgent || undefined,
  });

  return updated;
}

