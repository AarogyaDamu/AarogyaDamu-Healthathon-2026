import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireFeature } from '../middleware/requireFeature';
import { resolvePatientContext, AuthorizationError } from '../permissions/evaluator';
import { NotificationPreferenceUpdateSchema, DevicePushTokenRegisterSchema } from '@aarogyadamu/contracts';
import { logAuditEvent } from '../audit/auditLogger';
import { NotificationService } from '../services/notificationService';

import { prisma } from '../db/prisma';
export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.use(requireFeature('P0_4_NOTIFICATIONS_SOS'));

// 1. GET /api/notifications - List user's notifications (or delegated patient)
notificationsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const targetPatientId = req.headers['x-target-patient-id'] as string | undefined;
    const authenticatedUserId = (req as any).user.id;

    let targetUserId = authenticatedUserId;
    if (targetPatientId && targetPatientId !== authenticatedUserId) {
      const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_NOTIFICATIONS');
      targetUserId = effectivePatientId;
    }

    const isReadFilter = req.query.isRead !== undefined
      ? req.query.isRead === 'true'
      : undefined;

    const categoryFilter = req.query.category as string | undefined;

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

    const whereClause: any = {
      userId: targetUserId,
    };
    if (isReadFilter !== undefined) {
      whereClause.isRead = isReadFilter;
    }
    if (categoryFilter && categoryFilter !== 'ALL') {
      whereClause.category = categoryFilter;
    }

    const [notifications, totalUnread] = await Promise.all([
      prisma.careNotification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.careNotification.count({
        where: {
          userId: targetUserId,
          isRead: false,
        },
      }),
    ]);

    res.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        userId: n.userId,
        patientId: n.patientId,
        actorId: n.actorId,
        type: n.type,
        category: n.category,
        title: n.title,
        message: n.message,
        link: n.link,
        priority: n.priority,
        deliveryStatus: n.deliveryStatus,
        channel: n.channel,
        scheduledFor: n.scheduledFor ? n.scheduledFor.toISOString() : null,
        deliveredAt: n.deliveredAt ? n.deliveredAt.toISOString() : null,
        metadata: n.metadata ? JSON.parse(n.metadata) : null,
        isRead: n.isRead,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount: totalUnread,
    });
  } catch (err: any) {
    const status = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(status).json({ error: err.message || 'Unable to retrieve notifications.' });
  }
});

// 2. PATCH /api/notifications/:id/read - Mark notification as read
notificationsRouter.patch('/:id/read', async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedUserId = (req as any).user.id;
    const { id } = req.params;

    const notif = await prisma.careNotification.findUnique({
      where: { id },
    });

    if (!notif) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }

    // Must be recipient or have delegated permission
    if (notif.userId !== authenticatedUserId) {
      // Check delegated access if acting on behalf of patient
      req.headers['x-target-patient-id'] = notif.userId;
      await resolvePatientContext(req, 'VIEW_NOTIFICATIONS');
    }

    const updated = await prisma.careNotification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    res.json({
      success: true,
      notification: {
        ...updated,
        readAt: updated.readAt?.toISOString() || null,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (err: any) {
    const status = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(status).json({ error: err.message || 'Unable to mark notification as read.' });
  }
});

// 3. POST /api/notifications/read-all - Mark all unread notifications as read
notificationsRouter.post('/read-all', async (req: Request, res: Response): Promise<void> => {
  try {
    const targetPatientId = req.headers['x-target-patient-id'] as string | undefined;
    const authenticatedUserId = (req as any).user.id;

    let targetUserId = authenticatedUserId;
    if (targetPatientId && targetPatientId !== authenticatedUserId) {
      const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_NOTIFICATIONS');
      targetUserId = effectivePatientId;
    }

    const result = await prisma.careNotification.updateMany({
      where: {
        userId: targetUserId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: 'All notifications marked as read.',
      count: result.count,
    });
  } catch (err: any) {
    const status = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(status).json({ error: err.message || 'Unable to mark all notifications as read.' });
  }
});

// 4. POST /api/notifications/push-token - Register device push token
notificationsRouter.post('/push-token', async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedUserId = (req as any).user.id;
    const parsed = DevicePushTokenRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid device token payload',
        details: parsed.error.issues,
      });
      return;
    }

    const registered = await NotificationService.registerDevicePushToken(
      authenticatedUserId,
      parsed.data.token,
      parsed.data.platform,
      parsed.data.deviceInfo
    );

    res.json({
      success: true,
      token: {
        id: registered.id,
        platform: registered.platform,
        isActive: registered.isActive,
        createdAt: registered.createdAt.toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Unable to register device push token.' });
  }
});

// 5. DELETE /api/notifications/push-token - Deactivate device push token (logout/switch)
notificationsRouter.delete('/push-token', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = (req.body.token || req.query.token) as string;
    if (!token) {
      res.status(400).json({ error: 'Token is required to unregister device.' });
      return;
    }

    await NotificationService.unregisterDevicePushToken(token);
    res.json({ success: true, message: 'Device token deactivated.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Unable to unregister device push token.' });
  }
});

// 6. DELETE /api/notifications/:id - Delete or dismiss notification
notificationsRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedUserId = (req as any).user.id;
    const { id } = req.params;

    const notif = await prisma.careNotification.findUnique({
      where: { id },
    });

    if (!notif) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }

    if (notif.userId !== authenticatedUserId) {
      req.headers['x-target-patient-id'] = notif.userId;
      await resolvePatientContext(req, 'VIEW_NOTIFICATIONS');
    }

    await prisma.careNotification.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Notification removed.' });
  } catch (err: any) {
    const status = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(status).json({ error: err.message || 'Unable to delete notification.' });
  }
});

// 7. POST /api/notifications/test-dispatch - Create and dispatch notification
notificationsRouter.post('/test-dispatch', async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedUserId = (req as any).user.id;
    const { title, message, category, priority, type, scheduledFor } = req.body;

    const notif = await NotificationService.createCareNotification({
      userId: authenticatedUserId,
      type: type || 'SYSTEM_NOTICE',
      category: category || 'GENERAL',
      title: title || 'Care Update',
      message: message || 'Your diabetes care routine has an update.',
      priority: priority || 'NORMAL',
      scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
    });

    res.json({ success: true, notification: notif });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to dispatch notification.' });
  }
});

// 8. GET /api/notifications/preferences - Get notification preferences
notificationsRouter.get('/preferences', async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedUserId = (req as any).user.id;
    const targetPatientId = req.headers['x-target-patient-id'] as string | undefined;

    let targetUserId = authenticatedUserId;
    if (targetPatientId && targetPatientId !== authenticatedUserId) {
      const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_NOTIFICATIONS');
      targetUserId = effectivePatientId;
    }

    let pref = await prisma.notificationPreference.findUnique({
      where: { userId: targetUserId },
    });

    if (!pref) {
      pref = await prisma.notificationPreference.create({
        data: {
          userId: targetUserId,
          carePlanUpdates: true,
          medicationReminders: true,
          sugarCheckReminders: true,
          appointmentReminders: true,
          taskReminders: true,
          journeyMilestones: true,
          consultationUpdates: true,
          healthLoggingReminders: true,
          emergencyAlerts: true,
          pushEnabled: false,
          emailEnabled: false,
          smsEnabled: false,
          quietHoursEnabled: false,
          quietHoursStart: '22:00',
          quietHoursEnd: '07:00',
          timezone: 'Asia/Kolkata',
        },
      });
    }

    res.json({
      preferences: pref,
      deliveryChannels: {
        inApp: { enabled: true, status: 'ACTIVE' },
        push: { enabled: pref.pushEnabled, status: pref.pushEnabled ? 'ACTIVE' : 'UNCONFIGURED' },
        email: { enabled: pref.emailEnabled, status: 'AVAILABLE' },
        sms: { enabled: pref.smsEnabled, status: 'UNCONFIGURED' },
      },
    });
  } catch (err: any) {
    const status = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(status).json({ error: err.message || 'Unable to retrieve notification preferences.' });
  }
});

// 9. PUT /api/notifications/preferences - Update notification preferences
notificationsRouter.put('/preferences', async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedUserId = (req as any).user.id;
    const targetPatientId = req.headers['x-target-patient-id'] as string | undefined;

    let targetUserId = authenticatedUserId;
    if (targetPatientId && targetPatientId !== authenticatedUserId) {
      const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_NOTIFICATIONS');
      targetUserId = effectivePatientId;
    }

    const parsed = NotificationPreferenceUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid notification preferences payload',
        details: parsed.error.issues,
      });
      return;
    }

    const updated = await prisma.notificationPreference.upsert({
      where: { userId: targetUserId },
      create: {
        userId: targetUserId,
        ...parsed.data,
      },
      update: {
        ...parsed.data,
      },
    });

    await logAuditEvent({
      userId: targetUserId,
      actorId: authenticatedUserId,
      action: 'NOTIFICATION_PREFERENCES_UPDATED',
      entityType: 'NotificationPreference',
      entityId: updated.id,
      metadata: JSON.stringify(parsed.data),
    });

    res.json({
      success: true,
      preferences: updated,
    });
  } catch (err: any) {
    const status = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(status).json({ error: err.message || 'Unable to update notification preferences.' });
  }
});


