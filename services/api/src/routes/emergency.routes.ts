import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireFeature } from '../middleware/requireFeature';
import { resolvePatientContext, AuthorizationError } from '../permissions/evaluator';
import {
  EmergencyContactCreateSchema,
  EmergencyContactUpdateSchema,
  SosActivationSchema,
  SosCancellationSchema,
} from '@aarogyadamu/contracts';
import { logAuditEvent } from '../audit/auditLogger';
import { safeClinicalLog } from '../audit/clinicalAuditLogger';

import { prisma } from '../db/prisma';
export const emergencyRouter = Router();

emergencyRouter.use(requireAuth);
emergencyRouter.use(requireFeature('P0_4_NOTIFICATIONS_SOS'));

export const SOS_DISCLAIMER_NOTICE =
  'AarogyaDamu Emergency SOS is an in-app care team alert system and is NOT a substitute for local emergency services. In a life-threatening crisis, call local emergency services (112 / 108 / 911) immediately.';

// 1. GET /api/emergency/contacts - List emergency contacts
emergencyRouter.get('/contacts', async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_EMERGENCY');

    const contacts = await prisma.emergencyContact.findMany({
      where: { userId: effectivePatientId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    res.json({
      contacts: contacts.map((c) => ({
        id: c.id,
        userId: c.userId,
        name: c.name,
        relationship: c.relationship,
        phoneNumber: c.phoneNumber,
        email: c.email,
        isPrimary: c.isPrimary,
        notifyOnSos: c.notifyOnSos,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      disclaimer: SOS_DISCLAIMER_NOTICE,
    });
  } catch (err: any) {
    const code = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(code).json({ error: err.message || 'Unable to retrieve emergency contacts.' });
  }
});

// 2. POST /api/emergency/contacts - Add an emergency contact
emergencyRouter.post('/contacts', async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_EMERGENCY');
    const authenticatedUserId = (req as any).user.id;

    const parsed = EmergencyContactCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid emergency contact payload',
        details: parsed.error.issues,
      });
      return;
    }

    const { name, relationship, phoneNumber, email, isPrimary, notifyOnSos } = parsed.data;

    // If new contact is primary, reset existing primary contacts for this user
    if (isPrimary) {
      await prisma.emergencyContact.updateMany({
        where: { userId: effectivePatientId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const contact = await prisma.emergencyContact.create({
      data: {
        userId: effectivePatientId,
        name,
        relationship,
        phoneNumber,
        email: email || null,
        isPrimary: isPrimary ?? false,
        notifyOnSos: notifyOnSos ?? true,
      },
    });

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: authenticatedUserId,
      action: 'EMERGENCY_CONTACT_CREATED',
      entityType: 'EmergencyContact',
      entityId: contact.id,
      metadata: JSON.stringify({ name, relationship, isPrimary }),
    });

    res.status(201).json({
      contact: {
        ...contact,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    const code = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(code).json({ error: err.message || 'Unable to add emergency contact.' });
  }
});

// 3. PATCH /api/emergency/contacts/:id - Update an emergency contact
emergencyRouter.patch('/contacts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_EMERGENCY');
    const authenticatedUserId = (req as any).user.id;
    const { id } = req.params;

    const existing = await prisma.emergencyContact.findFirst({
      where: { id, userId: effectivePatientId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Emergency contact not found.' });
      return;
    }

    const parsed = EmergencyContactUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid emergency contact update payload',
        details: parsed.error.issues,
      });
      return;
    }

    if (parsed.data.isPrimary) {
      await prisma.emergencyContact.updateMany({
        where: { userId: effectivePatientId, isPrimary: true, id: { not: id } },
        data: { isPrimary: false },
      });
    }

    const updated = await prisma.emergencyContact.update({
      where: { id },
      data: parsed.data,
    });

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: authenticatedUserId,
      action: 'EMERGENCY_CONTACT_UPDATED',
      entityType: 'EmergencyContact',
      entityId: id,
      metadata: JSON.stringify(parsed.data),
    });

    res.json({
      contact: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    const code = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(code).json({ error: err.message || 'Unable to update emergency contact.' });
  }
});

// 4. DELETE /api/emergency/contacts/:id - Delete an emergency contact
emergencyRouter.delete('/contacts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_EMERGENCY');
    const authenticatedUserId = (req as any).user.id;
    const { id } = req.params;

    const existing = await prisma.emergencyContact.findFirst({
      where: { id, userId: effectivePatientId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Emergency contact not found.' });
      return;
    }

    await prisma.emergencyContact.delete({ where: { id } });

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: authenticatedUserId,
      action: 'EMERGENCY_CONTACT_DELETED',
      entityType: 'EmergencyContact',
      entityId: id,
    });

    res.json({ success: true, message: 'Emergency contact removed.' });
  } catch (err: any) {
    const code = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(code).json({ error: err.message || 'Unable to delete emergency contact.' });
  }
});

// 5. GET /api/emergency/sos/active - Retrieve current active SOS status
emergencyRouter.get('/sos/active', async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_EMERGENCY');

    const activeSos = await prisma.emergencySosEvent.findFirst({
      where: {
        userId: effectivePatientId,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      hasActiveSos: Boolean(activeSos),
      activeSos: activeSos
        ? {
            ...activeSos,
            symptoms: activeSos.symptoms ? JSON.parse(activeSos.symptoms) : [],
            cancelledAt: activeSos.cancelledAt?.toISOString() || null,
            resolvedAt: activeSos.resolvedAt?.toISOString() || null,
            createdAt: activeSos.createdAt.toISOString(),
            updatedAt: activeSos.updatedAt.toISOString(),
          }
        : null,
      limitationsNotice: SOS_DISCLAIMER_NOTICE,
    });
  } catch (err: any) {
    const code = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(code).json({ error: err.message || 'Unable to check active SOS status.' });
  }
});

// 6. POST /api/emergency/sos/activate - Deliberate Emergency SOS Activation
emergencyRouter.post('/sos/activate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_EMERGENCY');
    const authenticatedUserId = (req as any).user.id;

    const parsed = SosActivationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid SOS activation payload. Deliberate confirmation is required.',
        details: parsed.error.issues,
      });
      return;
    }

    const {
      triggerReason,
      symptoms,
      locationConsent,
      latitude,
      longitude,
      accuracyMeters,
      locationAddress,
      notes,
      idempotencyKey,
    } = parsed.data;

    // Idempotency check
    if (idempotencyKey) {
      const existing = await prisma.emergencySosEvent.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        res.status(200).json({
          sosEvent: {
            ...existing,
            symptoms: existing.symptoms ? JSON.parse(existing.symptoms) : [],
            createdAt: existing.createdAt.toISOString(),
            updatedAt: existing.updatedAt.toISOString(),
          },
          replayed: true,
          deliveryStatus: existing.deliveryStatus,
          externalCarrierStatus: 'UNCONFIGURED',
          limitationsNotice: SOS_DISCLAIMER_NOTICE,
        });
        return;
      }
    }

    // Prevent duplicate spam if already active
    const activeExisting = await prisma.emergencySosEvent.findFirst({
      where: {
        userId: effectivePatientId,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (activeExisting) {
      res.status(200).json({
        sosEvent: {
          ...activeExisting,
          symptoms: activeExisting.symptoms ? JSON.parse(activeExisting.symptoms) : [],
          createdAt: activeExisting.createdAt.toISOString(),
          updatedAt: activeExisting.updatedAt.toISOString(),
        },
        alreadyActive: true,
        deliveryStatus: activeExisting.deliveryStatus,
        externalCarrierStatus: 'UNCONFIGURED',
        limitationsNotice: SOS_DISCLAIMER_NOTICE,
      });
      return;
    }

    // Location verification: NEVER fabricate location
    let locationStatus: 'AVAILABLE' | 'PERMISSION_DENIED' | 'UNAVAILABLE' = 'UNAVAILABLE';
    let safeLat: number | null = null;
    let safeLng: number | null = null;
    let safeAcc: number | null = null;
    let safeAddr: string | null = null;

    if (locationConsent && latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined) {
      locationStatus = 'AVAILABLE';
      safeLat = latitude;
      safeLng = longitude;
      safeAcc = accuracyMeters || null;
      safeAddr = locationAddress || null;
    } else if (!locationConsent) {
      locationStatus = 'PERMISSION_DENIED';
    } else {
      locationStatus = 'UNAVAILABLE';
    }

    const sosEvent = await prisma.emergencySosEvent.create({
      data: {
        userId: effectivePatientId,
        activatedById: authenticatedUserId,
        status: 'ACTIVE',
        triggerReason: triggerReason || 'EMERGENCY_SOS_ACTIVATED',
        symptoms: symptoms ? JSON.stringify(symptoms) : null,
        locationStatus,
        latitude: safeLat,
        longitude: safeLng,
        accuracyMeters: safeAcc,
        locationAddress: safeAddr,
        notes: notes || null,
        deliveryStatus: 'IN_APP_DISPATCHED',
        disclaimerNotice: SOS_DISCLAIMER_NOTICE,
        idempotencyKey: idempotencyKey || null,
      },
    });

    // Notify patient
    await prisma.careNotification.create({
      data: {
        userId: effectivePatientId,
        patientId: effectivePatientId,
        actorId: authenticatedUserId,
        type: 'EMERGENCY_SOS',
        title: 'EMERGENCY SOS ACTIVATED',
        message: 'Your Emergency SOS alert has been broadcast to your registered care team.',
        link: '/sos',
      },
    });

    // Notify active caregivers
    const patientUser = await prisma.user.findUnique({
      where: { id: effectivePatientId },
      include: { profile: true },
    });
    const patientName = patientUser?.profile?.fullName || 'Patient';

    const activeConsents = await prisma.caregiverConsent.findMany({
      where: {
        patientId: effectivePatientId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    for (const consent of activeConsents) {
      const caregiverUser = await prisma.user.findUnique({
        where: { email: consent.caregiverEmail },
      });
      if (caregiverUser) {
        await prisma.careNotification.create({
          data: {
            userId: caregiverUser.id,
            patientId: effectivePatientId,
            actorId: authenticatedUserId,
            type: 'EMERGENCY_SOS',
            title: `CRITICAL ALERT: Emergency SOS for ${patientName}`,
            message: `${patientName} triggered an Emergency SOS alert. Please check in immediately.`,
            link: '/sos',
          },
        });
      }
    }

    // Notify assigned doctor
    const activeDoctorAssignment = await prisma.doctorPatientAssignment.findFirst({
      where: {
        patientId: effectivePatientId,
        status: 'ACTIVE',
      },
    });

    if (activeDoctorAssignment) {
      await prisma.careNotification.create({
        data: {
          userId: activeDoctorAssignment.doctorId,
          patientId: effectivePatientId,
          actorId: authenticatedUserId,
          type: 'EMERGENCY_SOS',
          title: `EMERGENCY SOS: Assigned Patient ${patientName}`,
          message: `${patientName} triggered an Emergency SOS alert. Immediate clinical awareness required.`,
          link: '/dashboard',
        },
      });
    }

    // Audit critical security event
    await logAuditEvent({
      userId: effectivePatientId,
      actorId: authenticatedUserId,
      action: 'EMERGENCY_SOS_ACTIVATED',
      entityType: 'EmergencySosEvent',
      entityId: sosEvent.id,
      metadata: JSON.stringify({
        triggerReason,
        locationStatus,
        caregiversAlerted: activeConsents.length,
        doctorAlerted: Boolean(activeDoctorAssignment),
      }),
    });

    safeClinicalLog('warn', `[CRITICAL_EMERGENCY_SOS] patient=${effectivePatientId} triggered by=${authenticatedUserId}`, {
      sosId: sosEvent.id,
      triggerReason,
      locationStatus,
    });

    res.status(201).json({
      sosEvent: {
        ...sosEvent,
        symptoms: symptoms || [],
        createdAt: sosEvent.createdAt.toISOString(),
        updatedAt: sosEvent.updatedAt.toISOString(),
      },
      deliveryStatus: 'IN_APP_DISPATCHED',
      externalCarrierStatus: 'UNCONFIGURED',
      externalCarrierNotice:
        'EXTERNAL_SMS_TELEPHONY_NOT_CONFIGURED: Emergency alerts dispatched to in-app care team and emergency contacts. No external carrier SMS/Call provider configured.',
      limitationsNotice: SOS_DISCLAIMER_NOTICE,
    });
  } catch (err: any) {
    const code = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(code).json({ error: err.message || 'Unable to activate Emergency SOS.' });
  }
});

// 7. POST /api/emergency/sos/:id/cancel - Cancel an accidental SOS activation
emergencyRouter.post('/sos/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_EMERGENCY');
    const authenticatedUserId = (req as any).user.id;
    const { id } = req.params;

    const parsed = SosCancellationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid SOS cancellation payload. Cancellation reason is required.',
        details: parsed.error.issues,
      });
      return;
    }

    const { reason } = parsed.data;

    const sosEvent = await prisma.emergencySosEvent.findFirst({
      where: {
        id,
        userId: effectivePatientId,
      },
    });

    if (!sosEvent) {
      res.status(404).json({ error: 'Emergency SOS event not found.' });
      return;
    }

    if (sosEvent.status !== 'ACTIVE') {
      res.status(400).json({
        error: `SOS event is already ${sosEvent.status.toLowerCase()}. Cannot cancel.`,
      });
      return;
    }

    const updated = await prisma.emergencySosEvent.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    // Notify patient
    await prisma.careNotification.create({
      data: {
        userId: effectivePatientId,
        patientId: effectivePatientId,
        actorId: authenticatedUserId,
        type: 'EMERGENCY_SOS_CANCELLED',
        title: 'Emergency SOS Cancelled',
        message: `Emergency SOS was cancelled: "${reason}"`,
      },
    });

    // Notify caregivers
    const activeConsents = await prisma.caregiverConsent.findMany({
      where: {
        patientId: effectivePatientId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    for (const consent of activeConsents) {
      const caregiver = await prisma.user.findUnique({
        where: { email: consent.caregiverEmail },
      });
      if (caregiver) {
        await prisma.careNotification.create({
          data: {
            userId: caregiver.id,
            patientId: effectivePatientId,
            actorId: authenticatedUserId,
            type: 'EMERGENCY_SOS_CANCELLED',
            title: 'Emergency SOS Standdown',
            message: `Emergency SOS alert was cancelled by user. Reason: "${reason}".`,
          },
        });
      }
    }

    // Notify assigned doctor
    const activeDoctorAssignment = await prisma.doctorPatientAssignment.findFirst({
      where: {
        patientId: effectivePatientId,
        status: 'ACTIVE',
      },
    });

    if (activeDoctorAssignment) {
      await prisma.careNotification.create({
        data: {
          userId: activeDoctorAssignment.doctorId,
          patientId: effectivePatientId,
          actorId: authenticatedUserId,
          type: 'EMERGENCY_SOS_CANCELLED',
          title: 'Emergency SOS Standdown',
          message: `Patient Emergency SOS alert was cancelled. Reason: "${reason}".`,
        },
      });
    }

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: authenticatedUserId,
      action: 'EMERGENCY_SOS_CANCELLED',
      entityType: 'EmergencySosEvent',
      entityId: id,
      metadata: JSON.stringify({ reason }),
    });

    res.json({
      success: true,
      sosEvent: {
        ...updated,
        symptoms: updated.symptoms ? JSON.parse(updated.symptoms) : [],
        cancelledAt: updated.cancelledAt?.toISOString() || null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    const code = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(code).json({ error: err.message || 'Unable to cancel Emergency SOS.' });
  }
});

