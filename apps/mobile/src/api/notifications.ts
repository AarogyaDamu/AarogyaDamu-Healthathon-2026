import { mobileApiFetch } from './client';

export type NotificationType =
  | 'MEDICATION_REMINDER'
  | 'CARE_PLAN_TASK'
  | 'LAB_RESULT_READY'
  | 'APPOINTMENT_UPCOMING'
  | 'EMERGENCY_ALERT'
  | 'CLINICAL_SAFETY_ALERT'
  | 'SYSTEM_NOTICE';

export interface MobileNotificationItem {
  id: string;
  userId: string;
  title: string;
  message?: string;
  body?: string;
  type: string;
  category?: 'MEDICATION' | 'TASK' | 'APPOINTMENT' | 'CARE_PLAN' | 'HEALTH_LOGGING' | 'CONSULTATION' | 'MILESTONE' | 'ACCOUNT' | 'GENERAL';
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  deliveryStatus?: 'CREATED' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'CANCELLED';
  channel?: 'IN_APP' | 'PUSH' | 'EMAIL';
  link?: string | null;
  scheduledFor?: string | null;
  isRead: boolean;
  readAt?: string | null;
  data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface MobileNotificationPreference {
  id?: string;
  userId: string;
  carePlanUpdates?: boolean;
  medicationReminders?: boolean;
  sugarCheckReminders?: boolean;
  appointmentReminders?: boolean;
  taskReminders?: boolean;
  journeyMilestones?: boolean;
  consultationUpdates?: boolean;
  healthLoggingReminders?: boolean;
  emergencyAlerts?: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  timezone?: string;
  reminderTiming?: number;
}

export type ReminderCategory =
  | 'MEDICATION'
  | 'CARE_PLAN'
  | 'APPOINTMENT'
  | 'LIFESTYLE'
  | 'LAB_TEST'
  | 'GENERAL';

export type ReminderStatus =
  | 'SCHEDULED'
  | 'DELIVERED'
  | 'ACKNOWLEDGED'
  | 'CANCELLED'
  | 'FAILED';

export type ReminderRecurrence =
  | 'ONCE'
  | 'DAILY'
  | 'WEEKLY'
  | 'CUSTOM';

export interface MobileReminder {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  category: ReminderCategory;
  scheduledTime: string;
  recurrence: ReminderRecurrence;
  timezone?: string | null;
  status: ReminderStatus;
  entityId?: string | null;
  acknowledgedAt?: string | null;
  cancelledAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReminderInput {
  title: string;
  description?: string;
  category: ReminderCategory;
  scheduledTime: string;
  recurrence?: ReminderRecurrence;
  timezone?: string;
  entityId?: string;
  acknowledgeUnreviewedSource?: boolean;
  idempotencyKey?: string;
  notes?: string;
}

export interface UpdateReminderInput {
  title?: string;
  description?: string;
  scheduledTime?: string;
  recurrence?: ReminderRecurrence;
  timezone?: string;
  status?: ReminderStatus;
  notes?: string;
}

export interface MobileEmergencyContact {
  id: string;
  userId: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string | null;
  priority: number;
  isPrimary: boolean;
  canReceiveSosAlerts: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmergencyContactInput {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  priority?: number;
  isPrimary?: boolean;
  canReceiveSosAlerts?: boolean;
}

export interface UpdateEmergencyContactInput {
  name?: string;
  relationship?: string;
  phone?: string;
  email?: string;
  priority?: number;
  isPrimary?: boolean;
  canReceiveSosAlerts?: boolean;
}

export interface MobileEmergencySosEvent {
  id: string;
  patientId: string;
  activatedById: string;
  triggeredAt: string;
  status: 'ACTIVE' | 'RESOLVED' | 'CANCELLED_FALSE_ALARM';
  reason?: string | null;
  locationConsent: boolean;
  latitude?: number | null;
  longitude?: number | null;
  locationStatus: string;
  deliveryStatus: 'IN_APP_DISPATCHED';
  externalCarrierStatus: 'UNCONFIGURED';
  cancelledAt?: string | null;
  cancelledReason?: string | null;
  resolvedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivateSosInput {
  confirmEmergency: true;
  reason?: string;
  locationConsent?: boolean;
  latitude?: number;
  longitude?: number;
  notes?: string;
}

export interface CancelSosInput {
  reason: string;
}

export const notificationsApi = {
  async getNotifications(category?: string, unreadOnly = false): Promise<MobileNotificationItem[]> {
    const params = new URLSearchParams();
    if (unreadOnly) params.append('unreadOnly', 'true');
    if (category && category !== 'ALL') params.append('category', category);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await mobileApiFetch<{ notifications: MobileNotificationItem[] }>(
      `/notifications${qs}`,
    );
    return res.notifications;
  },

  async markAsRead(id: string): Promise<MobileNotificationItem> {
    const res = await mobileApiFetch<{ notification: MobileNotificationItem }>(
      `/notifications/${encodeURIComponent(id)}/read`,
      { method: 'PATCH' },
    );
    return res.notification;
  },

  async markAllAsRead(): Promise<number> {
    const res = await mobileApiFetch<{ count: number }>(
      '/notifications/read-all',
      { method: 'POST' },
    );
    return res.count;
  },

  async deleteNotification(id: string): Promise<boolean> {
    const res = await mobileApiFetch<{ success: boolean }>(
      `/notifications/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    return res.success;
  },

  async registerPushToken(token: string, platform = 'EXPO', deviceInfo?: string): Promise<boolean> {
    try {
      const res = await mobileApiFetch<{ success: boolean }>(
        '/notifications/push-token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform, deviceInfo }),
        },
      );
      return res.success;
    } catch {
      return false;
    }
  },

  async unregisterPushToken(token: string): Promise<boolean> {
    try {
      const res = await mobileApiFetch<{ success: boolean }>(
        '/notifications/push-token',
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        },
      );
      return res.success;
    } catch {
      return false;
    }
  },

  async getPreferences(): Promise<MobileNotificationPreference> {
    const res = await mobileApiFetch<{ preferences: MobileNotificationPreference }>(
      '/notifications/preferences',
    );
    return res.preferences;
  },

  async updatePreferences(
    prefs: Partial<MobileNotificationPreference>,
  ): Promise<MobileNotificationPreference> {
    const res = await mobileApiFetch<{ preferences: MobileNotificationPreference }>(
      '/notifications/preferences',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      },
    );
    return res.preferences;
  },
};

export const remindersApi = {
  async getReminders(status?: ReminderStatus, category?: ReminderCategory): Promise<MobileReminder[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (category) params.append('category', category);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const res = await mobileApiFetch<{ reminders: MobileReminder[] }>(
      `/reminders${qs}`,
    );
    return res.reminders;
  },

  async createReminder(input: CreateReminderInput): Promise<MobileReminder> {
    const res = await mobileApiFetch<{ reminder: MobileReminder }>(
      '/reminders',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    return res.reminder;
  },

  async updateReminder(id: string, input: UpdateReminderInput): Promise<MobileReminder> {
    const res = await mobileApiFetch<{ reminder: MobileReminder }>(
      `/reminders/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    return res.reminder;
  },

  async acknowledgeReminder(id: string, note?: string): Promise<MobileReminder> {
    const res = await mobileApiFetch<{ reminder: MobileReminder }>(
      `/reminders/${encodeURIComponent(id)}/acknowledge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      },
    );
    return res.reminder;
  },

  async cancelReminder(id: string, reason?: string): Promise<MobileReminder> {
    const res = await mobileApiFetch<{ reminder: MobileReminder }>(
      `/reminders/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      },
    );
    return res.reminder;
  },
};

export const emergencyApi = {
  async getContacts(): Promise<MobileEmergencyContact[]> {
    const res = await mobileApiFetch<{ contacts: MobileEmergencyContact[] }>(
      '/emergency/contacts',
    );
    return res.contacts;
  },

  async createContact(input: CreateEmergencyContactInput): Promise<MobileEmergencyContact> {
    const res = await mobileApiFetch<{ contact: MobileEmergencyContact }>(
      '/emergency/contacts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    return res.contact;
  },

  async updateContact(
    id: string,
    input: UpdateEmergencyContactInput,
  ): Promise<MobileEmergencyContact> {
    const res = await mobileApiFetch<{ contact: MobileEmergencyContact }>(
      `/emergency/contacts/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    return res.contact;
  },

  async deleteContact(id: string): Promise<boolean> {
    const res = await mobileApiFetch<{ success: boolean }>(
      `/emergency/contacts/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    return res.success;
  },

  async getActiveSos(): Promise<MobileEmergencySosEvent | null> {
    try {
      const res = await mobileApiFetch<{ activeSos: MobileEmergencySosEvent | null }>(
        '/emergency/sos/active',
      );
      return res.activeSos;
    } catch {
      return null;
    }
  },

  async activateSos(input: ActivateSosInput): Promise<MobileEmergencySosEvent> {
    const res = await mobileApiFetch<{ sosEvent: MobileEmergencySosEvent }>(
      '/emergency/sos/activate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    return res.sosEvent;
  },

  async cancelSos(id: string, input: CancelSosInput): Promise<MobileEmergencySosEvent> {
    const res = await mobileApiFetch<{ sosEvent: MobileEmergencySosEvent }>(
      `/emergency/sos/${encodeURIComponent(id)}/cancel`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    return res.sosEvent;
  },
};
