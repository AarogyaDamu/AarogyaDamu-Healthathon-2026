import { safeClinicalLog } from '../audit/clinicalAuditLogger';
import { prisma } from '../db/prisma';

export type NotificationCategory =
  | 'MEDICATION'
  | 'TASK'
  | 'APPOINTMENT'
  | 'CARE_PLAN'
  | 'HEALTH_LOGGING'
  | 'CONSULTATION'
  | 'MILESTONE'
  | 'ACCOUNT'
  | 'GENERAL';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface CreateCareNotificationInput {
  userId: string;
  patientId?: string;
  actorId?: string;
  type: string;
  category?: NotificationCategory;
  title: string;
  message: string;
  link?: string;
  priority?: NotificationPriority;
  channel?: 'IN_APP' | 'PUSH' | 'EMAIL';
  scheduledFor?: Date;
  metadata?: Record<string, unknown>;
  bypassQuietHours?: boolean;
}

export class NotificationService {
  /**
   * Helper: Determines if current time in user's timezone falls within quiet hours.
   */
  static isQuietHours(
    timezone: string = 'Asia/Kolkata',
    startStr: string = '22:00',
    endStr: string = '07:00'
  ): boolean {
    try {
      const validTz = timezone || 'Asia/Kolkata';
      const now = new Date();
      // Format time in target timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: validTz,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      let hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
      if (hour === 24) hour = 0;
      const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
      const currentMins = hour * 60 + minute;

      const [startH, startM] = (startStr || '22:00').split(':').map((x) => parseInt(x, 10));
      const [endH, endM] = (endStr || '07:00').split(':').map((x) => parseInt(x, 10));
      const startMins = startH * 60 + (startM || 0);
      const endMins = endH * 60 + (endM || 0);

      if (startMins === endMins) return false;

      if (startMins > endMins) {
        // Overnight quiet hours (e.g. 22:00 to 07:00)
        return currentMins >= startMins || currentMins < endMins;
      } else {
        return currentMins >= startMins && currentMins < endMins;
      }
    } catch {
      return false;
    }
  }

  /**
   * Generates a privacy-conscious preview string suitable for lock-screen display.
   * Strips explicit clinical numbers (glucose mg/dL, units, sensitive medication doses).
   */
  static getPrivacyConsciousPreview(title: string, message: string, category: NotificationCategory): {
    previewTitle: string;
    previewMessage: string;
  } {
    switch (category) {
      case 'MEDICATION':
        return {
          previewTitle: 'AarogyaDamu Med Reminder',
          previewMessage: 'You have a scheduled medication reminder.',
        };
      case 'TASK':
        return {
          previewTitle: 'AarogyaDamu Care Task',
          previewMessage: 'You have a pending care routine activity.',
        };
      case 'APPOINTMENT':
        return {
          previewTitle: 'AarogyaDamu Appointment',
          previewMessage: 'An update is available for your healthcare consultation.',
        };
      case 'HEALTH_LOGGING':
        return {
          previewTitle: 'Health Tracking Reminder',
          previewMessage: 'Reminder to log your health observations in AarogyaDamu.',
        };
      case 'CONSULTATION':
        return {
          previewTitle: 'Clinical Documentation',
          previewMessage: 'New consultation summary shared by your clinic.',
        };
      case 'MILESTONE':
        return {
          previewTitle: 'Care Journey Milestone',
          previewMessage: 'You achieved a new milestone in your diabetes journey!',
        };
      default:
        return {
          previewTitle: title,
          previewMessage: message,
        };
    }
  }

  /**
   * Creates and dispatches a notification respecting preferences, quiet hours, and duplicate suppression.
   */
  static async createCareNotification(input: CreateCareNotificationInput) {
    const {
      userId,
      patientId,
      actorId,
      type,
      category = 'GENERAL',
      title,
      message,
      link,
      priority = 'NORMAL',
      channel = 'IN_APP',
      scheduledFor,
      metadata,
      bypassQuietHours = false,
    } = input;

    // 1. Fetch user notification preferences
    let prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await prisma.notificationPreference.create({
        data: {
          userId,
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
          timezone: 'Asia/Kolkata',
        },
      });
    }

    // 2. Check category preference toggle (Emergency priority bypasses)
    if (priority !== 'URGENT') {
      if (category === 'MEDICATION' && !prefs.medicationReminders) return null;
      if (category === 'TASK' && !prefs.taskReminders) return null;
      if (category === 'APPOINTMENT' && !prefs.appointmentReminders) return null;
      if (category === 'CARE_PLAN' && !prefs.carePlanUpdates) return null;
      if (category === 'HEALTH_LOGGING' && !prefs.healthLoggingReminders) return null;
      if (category === 'CONSULTATION' && !prefs.consultationUpdates) return null;
      if (category === 'MILESTONE' && !prefs.journeyMilestones) return null;
    }

    // 3. Duplicate Suppression Check (same user, type, title within last 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60000);
    const existingRecent = await prisma.careNotification.findFirst({
      where: {
        userId,
        type,
        title,
        createdAt: { gte: fifteenMinutesAgo },
      },
    });

    if (existingRecent && !scheduledFor) {
      // Suppress duplicate spam
      return existingRecent;
    }

    // 4. Quiet Hours & Scheduling Evaluation
    let deliveryStatus: 'CREATED' | 'QUEUED' | 'SENT' | 'DELIVERED' =
      channel === 'IN_APP' ? 'DELIVERED' : 'CREATED';
    let effectiveScheduledFor = scheduledFor;

    const inQuietHours =
      prefs.quietHoursEnabled &&
      !bypassQuietHours &&
      priority !== 'URGENT' &&
      this.isQuietHours(prefs.timezone || 'Asia/Kolkata', prefs.quietHoursStart || '22:00', prefs.quietHoursEnd || '07:00');

    if (inQuietHours && !effectiveScheduledFor) {
      // Queue until morning
      deliveryStatus = 'QUEUED';
      effectiveScheduledFor = new Date(Date.now() + 8 * 3600000); // placeholder next active window
    } else if (effectiveScheduledFor && effectiveScheduledFor.getTime() > Date.now()) {
      deliveryStatus = 'QUEUED';
    }

    // 5. Create Durable CareNotification Record
    const notification = await prisma.careNotification.create({
      data: {
        userId,
        patientId,
        actorId,
        type,
        category,
        title,
        message,
        link,
        priority,
        deliveryStatus,
        channel,
        scheduledFor: effectiveScheduledFor,
        deliveredAt: deliveryStatus === 'DELIVERED' ? new Date() : null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        isRead: false,
      },
    });

    // A registered token is not evidence that an external push provider accepted delivery.
    if (channel !== 'IN_APP' || prefs.pushEnabled) {
      const activeTokens = await prisma.devicePushToken.findMany({
        where: { userId, isActive: true },
      });

      if (channel !== 'IN_APP' || activeTokens.length > 0) {
        safeClinicalLog('warn', 'External notification not dispatched: no delivery provider is configured.', {
          notificationId: notification.id,
          channel,
          tokenCount: activeTokens.length,
          category,
        });
      }
    }

    return notification;
  }

  /**
   * Cancels obsolete scheduled notifications (e.g. when an appointment is rescheduled/cancelled, or task completed).
   */
  static async cancelObsoleteNotifications(entityType: string, entityId: string): Promise<number> {
    const notifications = await prisma.careNotification.findMany({
      where: {
        deliveryStatus: 'QUEUED',
        metadata: { contains: `"${entityId}"` },
      },
    });

    if (notifications.length === 0) return 0;

    const result = await prisma.careNotification.updateMany({
      where: {
        id: { in: notifications.map((n) => n.id) },
      },
      data: {
        deliveryStatus: 'CANCELLED',
      },
    });

    return result.count;
  }

  /**
   * Registers or updates a device push token for a patient.
   */
  static async registerDevicePushToken(
    userId: string,
    token: string,
    platform: 'EXPO' | 'ANDROID' | 'IOS' | 'WEB' = 'EXPO',
    deviceInfo?: string
  ) {
    return prisma.devicePushToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform,
        deviceInfo,
        isActive: true,
      },
      update: {
        userId,
        platform,
        deviceInfo,
        isActive: true,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Deactivates a device push token upon logout or account switch.
   */
  static async unregisterDevicePushToken(token: string) {
    const existing = await prisma.devicePushToken.findUnique({ where: { token } });
    if (!existing) return null;
    return prisma.devicePushToken.update({
      where: { token },
      data: { isActive: false },
    });
  }
}
