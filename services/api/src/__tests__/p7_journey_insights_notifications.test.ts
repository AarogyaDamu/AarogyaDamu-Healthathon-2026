import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app, prisma } from '../server';
import { HealthInsightService } from '../services/healthInsightService';
import { NotificationService } from '../services/notificationService';
import { classifyDamuIntent } from '../ai/agent/damuNluService';
import {
  getJourneyProgressSummaryTool,
  getJourneyInsightsTool,
  getDoctorDiscussionPointsTool,
  explainReminderTool,
} from '../ai/agent/readOnlyTools';

import { setFeatureFlag } from '../features/featureFlags';

describe('Phase 7 — Health Journey Insights, Progress Monitoring & Notifications Test Suite', () => {
  let doctorAssigned: { id: string; email: string; token: string };
  let doctorStranger: { id: string; email: string; token: string };
  let patientA: { id: string; email: string; token: string };
  let patientEmpty: { id: string; email: string; token: string };
  let caregiverAllowed: { id: string; email: string; token: string };
  let caregiverRestricted: { id: string; email: string; token: string };

  let medPrescriptionId: string;
  let careTaskId: string;

  jest.setTimeout(45000);

  beforeAll(async () => {
    await setFeatureFlag('P0_6_GROQ_VOICE_ASSISTANT', true, 'development');
    await setFeatureFlag('P0_6_GROQ_DAMU_ASSISTANT', true, 'development');

    const passwordHash = await bcrypt.hash('SecurePass123!', 10);

    const createUser = async (email: string, fullName: string, isClinician = false) => {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          isClinician,
          profile: {
            create: {
              fullName,
              diabetesType: isClinician ? undefined : 'Type 2 Diabetes Mellitus',
              targetFastingMin: 80,
              targetFastingMax: 130,
              targetPostMealMax: 180,
            },
          },
        },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'SecurePass123!' });

      return { id: user.id, email: user.email, token: res.body.token };
    };

    const runId = Date.now();
    doctorAssigned = await createUser(`dr.assigned.p7.${runId}@example.com`, 'Dr. Rajesh Sen', true);
    doctorStranger = await createUser(`dr.stranger.p7.${runId}@example.com`, 'Dr. Ananya Roy', true);
    patientA = await createUser(`patient.ramesh.p7.${runId}@example.com`, 'Ramesh Varma');
    patientEmpty = await createUser(`patient.new.p7.${runId}@example.com`, 'Sita Rao');
    caregiverAllowed = await createUser(`caregiver.allowed.p7.${runId}@example.com`, 'Kiran Varma');
    caregiverRestricted = await createUser(`caregiver.restricted.p7.${runId}@example.com`, 'Ravi Kumar');

    // 1. Establish Doctor-Patient Assignment
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: doctorAssigned.id,
        patientId: patientA.id,
        status: 'ACTIVE',
      },
    });

    // 2. Establish Caregiver Consents
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: caregiverAllowed.email,
        caregiverName: 'Kiran Varma',
        relationship: 'DAUGHTER',
        status: 'ACTIVE',
        permissions: JSON.stringify([
          'VIEW_HEALTH_SUMMARY',
          'VIEW_HEALTH_TIMELINE',
          'VIEW_NOTIFICATIONS',
          'VIEW_TASKS',
          'MANAGE_TASKS',
          'VIEW_MEDICATIONS',
        ]),
      },
    });

    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: caregiverRestricted.email,
        caregiverName: 'Ravi Kumar',
        relationship: 'FRIEND',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_EMERGENCY_CONTACTS']),
      },
    });

    // 3. Seed Patient A Observations (Glucose readings)
    const now = new Date();
    await prisma.healthObservation.createMany({
      data: [
        {
          userId: patientA.id,
          type: 'BLOOD_GLUCOSE',
          numericValue: 105,
          unit: 'mg/dL',
          context: 'FASTING',
          clinicalFlag: 'NORMAL',
          observedAt: new Date(now.getTime() - 1 * 86400000),
        },
        {
          userId: patientA.id,
          type: 'BLOOD_GLUCOSE',
          numericValue: 125,
          unit: 'mg/dL',
          context: 'POST_MEAL_2HR',
          clinicalFlag: 'NORMAL',
          observedAt: new Date(now.getTime() - 2 * 86400000),
        },
        {
          userId: patientA.id,
          type: 'BLOOD_GLUCOSE',
          numericValue: 115,
          unit: 'mg/dL',
          context: 'FASTING',
          clinicalFlag: 'NORMAL',
          observedAt: new Date(now.getTime() - 3 * 86400000),
        },
        {
          userId: patientA.id,
          type: 'BLOOD_GLUCOSE',
          numericValue: 110,
          unit: 'mg/dL',
          context: 'PRE_MEAL',
          clinicalFlag: 'NORMAL',
          observedAt: new Date(now.getTime() - 5 * 86400000),
        },
        {
          userId: patientA.id,
          type: 'BLOOD_GLUCOSE',
          numericValue: 135,
          unit: 'mg/dL',
          context: 'POST_MEAL_2HR',
          clinicalFlag: 'NORMAL',
          observedAt: new Date(now.getTime() - 8 * 86400000),
        },
      ],
    });

    // 4. Seed Med Vault Prescriptions & Adherence Events
    const med = await prisma.medicationSchedule.create({
      data: {
        userId: patientA.id,
        medicineName: 'Metformin 500mg',
        dosage: '1 tablet twice daily',
        timing: 'MORNING_AND_EVENING',
        foodInstructions: 'Take with or after meals',
        prescriber: 'Dr. Rajesh Sen',
        source: 'CLINICIAN_PRESCRIBED',
        status: 'ACTIVE',
        isActive: true,
      },
    });
    medPrescriptionId = med.id;

    // Log adherence events: 4 TAKEN, 1 SKIPPED -> 80% adherence rate
    for (let i = 1; i <= 4; i++) {
      await prisma.medicationAdherenceEvent.create({
        data: {
          userId: patientA.id,
          medicationId: med.id,
          action: 'TAKEN',
          scheduledTime: new Date(now.getTime() - i * 86400000),
          recordedBy: patientA.id,
          notes: 'Taken on time after food',
          sourceProvenance: 'MANUAL_PATIENT',
        },
      });
    }
    await prisma.medicationAdherenceEvent.create({
      data: {
        userId: patientA.id,
        medicationId: med.id,
        action: 'SKIPPED',
        scheduledTime: new Date(now.getTime() - 5 * 86400000),
        recordedBy: patientA.id,
        notes: 'Forgot dose while traveling',
        sourceProvenance: 'MANUAL_PATIENT',
      },
    });

    // 5. Seed Care Tasks
    const completedTask = await prisma.careTask.create({
      data: {
        userId: patientA.id,
        assignedById: doctorAssigned.id,
        title: 'Morning 20-min Brisk Walk',
        category: 'EXERCISE',
        status: 'COMPLETED',
        dueAt: new Date(now.getTime() - 2 * 86400000),
        completedAt: new Date(now.getTime() - 2 * 86400000 + 3600000),
        completedById: patientA.id,
        completedByRole: 'PATIENT',
      },
    });
    careTaskId = completedTask.id;

    await prisma.careTask.create({
      data: {
        userId: patientA.id,
        assignedById: doctorAssigned.id,
        title: 'Foot Examination',
        category: 'FOOT_CARE',
        status: 'PENDING',
        dueAt: new Date(now.getTime() - 86400000), // Overdue
      },
    });

    // 6. Seed Appointment
    await prisma.appointment.create({
      data: {
        patientId: patientA.id,
        doctorId: doctorAssigned.id,
        bookedById: patientA.id,
        scheduledAt: new Date(now.getTime() + 5 * 86400000),
        reason: 'Routine Glycemic Review',
        status: 'CONFIRMED',
        visitType: 'IN_PERSON',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // =========================================================================
  // 1. PATIENT JOURNEY PROGRESS AGGREGATION & ROBUST FALLBACKS
  // =========================================================================
  describe('1. Patient Journey Progress Aggregation & Robust Fallbacks', () => {
    it('aggregates progress summary for patient with rich clinical records', async () => {
      const summary = await HealthInsightService.getJourneyProgressSummary(patientA.id);

      expect(summary).toBeDefined();
      expect(summary.patientId).toBe(patientA.id);
      expect(summary.overallProgress.currentStageId).toBeDefined();

      // Glycemic stats
      expect(summary.glucoseProgress.totalReadings30Days).toBe(5);
      expect(summary.glucoseProgress.averageGlucose30Days).toBeGreaterThan(100);
      expect(summary.glucoseProgress.timeInRangePercentage).toBe(100); // 105, 125, 115, 110, 135 are 80-180
      expect(['STABLE', 'DECREASING']).toContain(summary.glucoseProgress.trendDirection);

      // Medication adherence
      expect(summary.medicationAdherence.prescribedMedicinesCount).toBe(1);
      expect(summary.medicationAdherence.takenDosesCount).toBe(4);
      expect(summary.medicationAdherence.skippedDosesCount).toBe(1);
      expect(summary.medicationAdherence.adherenceRatePercentage).toBe(80);

      // Care tasks
      expect(summary.carePlanProgress.totalTasksAssigned).toBe(2);
      expect(summary.carePlanProgress.completedTasksCount).toBe(1);
      expect(summary.carePlanProgress.pendingTasksCount).toBe(1);
      expect(summary.carePlanProgress.overdueTasksCount).toBe(1);
      expect(summary.carePlanProgress.completionRatePercentage).toBe(50);

      // Consultations and appointments
      expect(summary.consultationsAndAppointments.upcomingAppointmentsCount).toBe(1);
      expect(summary.consultationsAndAppointments.nextAppointment).toBeDefined();
      expect(summary.consultationsAndAppointments.nextAppointment?.reason).toBe('Routine Glycemic Review');

      // Non-causation disclaimer
      expect(summary.glucoseProgress.nonCausationDisclaimer).toContain('descriptive statistical calculations');
      expect(summary.glucoseProgress.nonCausationDisclaimer).toContain('does not assert medical causation');
    });

    it('handles empty/incomplete patient records gracefully without NaN or errors', async () => {
      const summary = await HealthInsightService.getJourneyProgressSummary(patientEmpty.id);

      expect(summary).toBeDefined();
      expect(summary.patientId).toBe(patientEmpty.id);
      expect(summary.glucoseProgress.totalReadings30Days).toBe(0);
      expect(summary.glucoseProgress.averageGlucose30Days).toBeNull();
      expect(summary.glucoseProgress.timeInRangePercentage).toBe(0);
      expect(summary.glucoseProgress.trendDelta7Days).toBeNull();
      expect(summary.glucoseProgress.missingMeasurementAlert).toBeDefined();

      expect(summary.medicationAdherence.prescribedMedicinesCount).toBe(0);
      expect(summary.medicationAdherence.adherenceRatePercentage).toBe(100); // Neutral default when 0 doses logged

      expect(summary.carePlanProgress.totalTasksAssigned).toBe(0);
      expect(summary.carePlanProgress.completionRatePercentage).toBe(100);
      expect(summary.consultationsAndAppointments.upcomingAppointmentsCount).toBe(0);
      expect(summary.glucoseProgress.nonCausationDisclaimer).toBeDefined();
    });
  });

  // =========================================================================
  // 2. HEALTH INSIGHT ENGINE & NON-CAUSATION GOVERNANCE
  // =========================================================================
  describe('2. Health Insight Engine & Non-Causation Governance', () => {
    it('generates grounded glycemic and adherence insights with non-causation disclaimers', async () => {
      const insights = await HealthInsightService.calculateHealthInsights(patientA.id);

      expect(insights.length).toBeGreaterThanOrEqual(2);

      // Find Glycemic insight
      const glucoseInsight = insights.find((i) => i.category === 'GLUCOSE');
      expect(glucoseInsight).toBeDefined();
      expect(glucoseInsight?.sourceReference).toContain('HealthObservation');

      // Find Medication insight (80% adherence)
      const medInsight = insights.find((i) => i.category === 'MEDICATION');
      expect(medInsight).toBeDefined();
      expect(medInsight?.confidence).toBeGreaterThan(0.5);

      // Find Care plan / Task insight
      const taskInsight = insights.find((i) => i.category === 'CARE_PLAN');
      expect(taskInsight).toBeDefined();
    });

    it('suppresses statistical trend claims when patient data is insufficient (< 3 readings)', async () => {
      const userSparse = await prisma.user.create({
        data: {
          email: `sparse.${Date.now()}@example.com`,
          passwordHash: 'dummy',
          profile: { create: { fullName: 'Sparse Data User' } },
        },
      });

      await prisma.healthObservation.create({
        data: {
          userId: userSparse.id,
          type: 'BLOOD_GLUCOSE',
          numericValue: 120,
          observedAt: new Date(),
        },
      });

      const insights = await HealthInsightService.calculateHealthInsights(userSparse.id);
      const glucoseInsight = insights.find((i) => i.category === 'GLUCOSE');

      expect(glucoseInsight).toBeDefined();
      expect(glucoseInsight?.dataSufficiency).toBe('INSUFFICIENT');
      expect(glucoseInsight?.title).toContain('Insufficient');
    });
  });

  // =========================================================================
  // 3. JOURNEY MILESTONES & IDEMPOTENCY
  // =========================================================================
  describe('3. Journey Milestones & Idempotency', () => {
    it('awards journey milestones from real clinical events idempotently', async () => {
      const initialMilestones = await HealthInsightService.generatePatientMilestones(patientA.id);
      expect(initialMilestones.length).toBeGreaterThan(0);

      const hasFirstLog = initialMilestones.some((m) => m.milestoneKey === 'FIRST_GLUCOSE_READING');
      const hasTaskDone = initialMilestones.some((m) => m.milestoneKey === 'FIRST_TASK_COMPLETED');
      expect(hasFirstLog).toBe(true);
      expect(hasTaskDone).toBe(true);

      // Running generation again must not create duplicate milestone rows
      const secondRun = await HealthInsightService.generatePatientMilestones(patientA.id);
      expect(secondRun.length).toBe(initialMilestones.length);

      const countInDb = await prisma.journeyMilestone.count({
        where: { userId: patientA.id },
      });
      expect(countInDb).toBe(initialMilestones.length);
    });

    it('GET /api/journey/milestones returns awarded milestones for authenticated patient', async () => {
      const res = await request(app)
        .get('/api/journey/milestones')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.milestones)).toBe(true);
      expect(res.body.milestones.length).toBeGreaterThan(0);
      expect(res.body.milestones[0]).toHaveProperty('milestoneKey');
      expect(res.body.milestones[0]).toHaveProperty('title');
    });
  });

  // =========================================================================
  // 4. CARE NOTIFICATION CENTER & DELIVERY GOVERNANCE
  // =========================================================================
  describe('4. Care Notification Center & Delivery Governance', () => {
    let createdNotifId: string;

    it('creates notifications across categories with delivery governance and status tracking', async () => {
      const notif = await NotificationService.createCareNotification({
        userId: patientA.id,
        category: 'MEDICATION',
        type: 'MEDICATION_REMINDER',
        title: 'Prescribed Dose Reminder: Metformin 500mg',
        message: 'Please take 500mg Metformin after your meal as prescribed.',
        priority: 'NORMAL',
        channel: 'IN_APP',
      });

      expect(notif).not.toBeNull();
      expect(notif?.userId).toBe(patientA.id);
      expect(notif?.category).toBe('MEDICATION');
      expect(notif?.priority).toBe('NORMAL');
      expect(['DELIVERED', 'SENT']).toContain(notif?.deliveryStatus);
      createdNotifId = notif!.id;

      // Create a task notification
      await NotificationService.createCareNotification({
        userId: patientA.id,
        category: 'TASK',
        type: 'CARE_PLAN_TASK',
        title: 'Doctor Task Due: Foot Examination',
        message: 'Dr. Rajesh Sen assigned a foot examination check for today.',
        priority: 'HIGH',
      });

      // Create an appointment notification
      await NotificationService.createCareNotification({
        userId: patientA.id,
        category: 'APPOINTMENT',
        type: 'APPOINTMENT_UPCOMING',
        title: 'Upcoming Clinic Appointment',
        message: 'Your glycemic review is scheduled in 5 days.',
        priority: 'NORMAL',
      });
    });

    it('GET /api/notifications returns notification list and unread count', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.notifications)).toBe(true);
      expect(res.body.notifications.length).toBeGreaterThanOrEqual(3);
      expect(res.body.unreadCount).toBeGreaterThan(0);
    });

    it('GET /api/notifications?category=TASK filters by category', async () => {
      const res = await request(app)
        .get('/api/notifications?category=TASK')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.notifications.every((n: any) => n.category === 'TASK')).toBe(true);
    });

    it('PATCH /api/notifications/:id/read marks notification as read', async () => {
      const res = await request(app)
        .patch(`/api/notifications/${createdNotifId}/read`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.notification.isRead).toBe(true);
      expect(res.body.notification.readAt).toBeDefined();
    });

    it('POST /api/notifications/read-all marks all notifications as read', async () => {
      const res = await request(app)
        .post('/api/notifications/read-all')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const check = await request(app)
        .get('/api/notifications?unreadOnly=true')
        .set('Authorization', `Bearer ${patientA.token}`);
      expect(check.body.unreadCount).toBe(0);
    });

    it('DELETE /api/notifications/:id deletes notification', async () => {
      const res = await request(app)
        .delete(`/api/notifications/${createdNotifId}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const check = await prisma.careNotification.findUnique({
        where: { id: createdNotifId },
      });
      expect(check).toBeNull();
    });

    it('DELETE /api/notifications/:id prevents deleting another user notification', async () => {
      const otherNotif = await prisma.careNotification.create({
        data: {
          userId: patientEmpty.id,
          title: 'Private Notice',
          message: 'Private message content',
          category: 'ACCOUNT',
          type: 'SYSTEM_NOTICE',
        },
      });

      const res = await request(app)
        .delete(`/api/notifications/${otherNotif.id}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. NOTIFICATION PREFERENCES, QUIET HOURS & PRIVACY PREVIEWS
  // =========================================================================
  describe('5. Notification Preferences, Quiet Hours & Privacy Previews', () => {
    it('evaluates timezone-aware quiet hours accurately', () => {
      // Test function directly
      const isQuietNight = NotificationService.isQuietHours('UTC', '00:00', '23:59');
      expect(isQuietNight).toBe(true);

      const isQuietOff = NotificationService.isQuietHours('UTC', '00:00', '00:00');
      expect(isQuietOff).toBe(false);
    });

    it('generates privacy-conscious lock-screen previews suppressing PHI', () => {
      const medPreview = NotificationService.getPrivacyConsciousPreview(
        'Metformin 500mg Dose Reminder',
        'Take 500mg Metformin twice daily with food.',
        'MEDICATION',
      );
      expect(medPreview.previewTitle).toBe('AarogyaDamu Med Reminder');
      expect(medPreview.previewMessage).not.toContain('Metformin');
      expect(medPreview.previewMessage).not.toContain('500mg');

      const sugarPreview = NotificationService.getPrivacyConsciousPreview(
        'Fasting Blood Sugar Log',
        'Your fasting blood glucose was 145 mg/dL.',
        'HEALTH_LOGGING',
      );
      expect(sugarPreview.previewTitle).toBe('Health Tracking Reminder');
      expect(sugarPreview.previewMessage).not.toContain('145');
    });

    it('enforces quiet hours delivery governance: queues non-urgent, dispatches urgent', async () => {
      // Enable quiet hours on patientA (all day window 00:00 -> 23:59)
      await prisma.notificationPreference.upsert({
        where: { userId: patientA.id },
        create: {
          userId: patientA.id,
          quietHoursEnabled: true,
          quietHoursStart: '00:00',
          quietHoursEnd: '23:59',
          timezone: 'UTC',
        },
        update: {
          quietHoursEnabled: true,
          quietHoursStart: '00:00',
          quietHoursEnd: '23:59',
          timezone: 'UTC',
        },
      });

      // Non-urgent notification should be QUEUED
      const normalNotif = await NotificationService.createCareNotification({
        userId: patientA.id,
        category: 'MEDICATION',
        type: 'MEDICATION_REMINDER',
        title: 'Medication Time',
        message: 'Scheduled dose is due.',
        priority: 'NORMAL',
      });
      expect(normalNotif).not.toBeNull();
      expect(normalNotif?.deliveryStatus).toBe('QUEUED');

      // Urgent safety alert must BYPASS quiet hours and be SENT
      const urgentAlert = await NotificationService.createCareNotification({
        userId: patientA.id,
        category: 'ACCOUNT',
        type: 'CLINICAL_SAFETY_ALERT',
        title: 'Critical Safety Alert',
        message: 'Immediate attention required.',
        priority: 'URGENT',
      });
      expect(urgentAlert).not.toBeNull();
      expect(['SENT', 'DELIVERED']).toContain(urgentAlert?.deliveryStatus);
    });

    it('PUT /api/notifications/preferences saves granular preferences and quiet hours', async () => {
      const res = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          medicationReminders: true,
          taskReminders: true,
          journeyMilestones: true,
          consultationUpdates: false,
          healthLoggingReminders: true,
          quietHoursEnabled: true,
          quietHoursStart: '22:30',
          quietHoursEnd: '06:30',
          timezone: 'Asia/Kolkata',
          pushEnabled: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.preferences.taskReminders).toBe(true);
      expect(res.body.preferences.consultationUpdates).toBe(false);
      expect(res.body.preferences.quietHoursStart).toBe('22:30');
      expect(res.body.preferences.timezone).toBe('Asia/Kolkata');
    });
  });

  // =========================================================================
  // 6. DEVICE PUSH TOKEN MANAGEMENT & ROTATION
  // =========================================================================
  describe('6. Device Push Token Management & Rotation', () => {
    const testPushToken = 'ExponentPushToken[p7-test-device-uuid-12345]';

    it('POST /api/notifications/push-token registers active push token idempotently', async () => {
      const res = await request(app)
        .post('/api/notifications/push-token')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          token: testPushToken,
          platform: 'EXPO',
          deviceInfo: 'Android Pixel 8 API 34',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbToken = await prisma.devicePushToken.findUnique({
        where: { token: testPushToken },
      });
      expect(dbToken).toBeDefined();
      expect(dbToken?.userId).toBe(patientA.id);
      expect(dbToken?.isActive).toBe(true);

      // Re-registration updates lastActiveAt without duplicating
      const reRes = await request(app)
        .post('/api/notifications/push-token')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          token: testPushToken,
          platform: 'EXPO',
        });
      expect(reRes.status).toBe(200);
    });

    it('DELETE /api/notifications/push-token deactivates token on signout', async () => {
      const res = await request(app)
        .delete('/api/notifications/push-token')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({ token: testPushToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbToken = await prisma.devicePushToken.findUnique({
        where: { token: testPushToken },
      });
      expect(dbToken?.isActive).toBe(false);
    });
  });

  // =========================================================================
  // 7. DOCTOR WORKSTATION PROGRESS OVERVIEW & CLINICAL BOUNDARIES
  // =========================================================================
  describe('7. Doctor Workstation Progress Overview & Clinical Boundaries', () => {
    it('allows assigned doctor to view patient journey progress summary', async () => {
      const res = await request(app)
        .get(`/api/journey/summary?patientId=${patientA.id}`)
        .set('Authorization', `Bearer ${doctorAssigned.token}`);

      expect(res.status).toBe(200);
      expect(res.body.patientId).toBe(patientA.id);
      expect(res.body.glucoseProgress).toBeDefined();
      expect(res.body.medicationAdherence).toBeDefined();
      expect(res.body.carePlanProgress).toBeDefined();
    });

    it('allows assigned doctor to view patient validated health insights', async () => {
      const res = await request(app)
        .get(`/api/journey/insights?patientId=${patientA.id}`)
        .set('Authorization', `Bearer ${doctorAssigned.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.insights)).toBe(true);
      expect(res.body.insights.length).toBeGreaterThan(0);
    });

    it('allows assigned doctor to view patient milestones', async () => {
      const res = await request(app)
        .get(`/api/journey/milestones?patientId=${patientA.id}`)
        .set('Authorization', `Bearer ${doctorAssigned.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.milestones)).toBe(true);
    });

    it('rejects unassigned doctor with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/journey/summary?patientId=${patientA.id}`)
        .set('Authorization', `Bearer ${doctorStranger.token}`);

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 8. CAREGIVER PERMISSION GOVERNANCE & ACTOR ATTRIBUTION
  // =========================================================================
  describe('8. Caregiver Permission Governance & Actor Attribution', () => {
    it('allows caregiver with VIEW_HEALTH_SUMMARY to access patient journey summary', async () => {
      const res = await request(app)
        .get('/api/journey/summary')
        .set('Authorization', `Bearer ${caregiverAllowed.token}`)
        .set('x-target-patient-id', patientA.id);

      expect(res.status).toBe(200);
      expect(res.body.patientId).toBe(patientA.id);
    });

    it('allows caregiver with VIEW_NOTIFICATIONS to view patient care notifications', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${caregiverAllowed.token}`)
        .set('x-target-patient-id', patientA.id);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.notifications)).toBe(true);
    });

    it('rejects restricted caregiver without journey/notification permissions with 403 Forbidden', async () => {
      const resSummary = await request(app)
        .get('/api/journey/summary')
        .set('Authorization', `Bearer ${caregiverRestricted.token}`)
        .set('x-target-patient-id', patientA.id);

      expect(resSummary.status).toBe(403);

      const resNotif = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${caregiverRestricted.token}`)
        .set('x-target-patient-id', patientA.id);

      expect(resNotif.status).toBe(403);
    });

    it('records actor attribution and triggers DELEGATED_TASK_COMPLETED notification when caregiver completes task', async () => {
      const task = await prisma.careTask.create({
        data: {
          userId: patientA.id,
          assignedById: doctorAssigned.id,
          title: 'Evening Blood Pressure Check',
          category: 'VITALS',
          status: 'PENDING',
          dueAt: new Date(),
        },
      });

      const res = await request(app)
        .post(`/api/tasks/${task.id}/complete`)
        .set('Authorization', `Bearer ${caregiverAllowed.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({ notes: 'Completed with home digital BP cuff: 122/78 mmHg' });

      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe('COMPLETED');
      expect(res.body.task.completedById).toBe(caregiverAllowed.id);
      expect(res.body.task.completedByRole).toBe('CAREGIVER');

      const notif = await prisma.careNotification.findFirst({
        where: {
          userId: patientA.id,
          type: 'DELEGATED_TASK_COMPLETED',
        },
      });
      expect(notif).toBeDefined();
      expect(notif?.category).toBe('TASK');
      expect(notif?.title).toContain('Caregiver');
    });
  });

  // =========================================================================
  // 9. DAMU AI JOURNEY INTENTS & READ-ONLY TOOLS INTEGRATION
  // =========================================================================
  describe('9. Damu AI Journey Intents & Read-Only Tools Integration', () => {
    it('classifies Phase 7 conversational intents accurately', () => {
      expect(classifyDamuIntent('How am I doing on my health journey progress?').intent).toBe('JOURNEY_PROGRESS');
      expect(classifyDamuIntent('Show my diabetes milestones and badges').intent).toBe('JOURNEY_PROGRESS');
      expect(classifyDamuIntent('What should I discuss with my doctor in my next visit?').intent).toBe('DOCTOR_DISCUSSION_POINTS');
      expect(classifyDamuIntent('Why did I get this reminder and what are quiet hours?').intent).toBe('REMINDER_EXPLANATION');
    });

    it('getJourneyProgressSummaryTool retrieves aggregated metrics with non-causation disclaimer', async () => {
      const result = await getJourneyProgressSummaryTool(patientA.id);

      expect(result.toolName).toBe('get_journey_progress_summary');
      expect(result.data).toBeDefined();
      const summaryData = result.data as any;
      expect(summaryData.glucoseProgress.totalReadings30Days).toBe(5);
      expect(result.summary).toContain('Time-in-Range');
      expect(result.sources.length).toBeGreaterThan(0);
    });

    it('getJourneyInsightsTool retrieves validated insights grounded in records', async () => {
      const result = await getJourneyInsightsTool(patientA.id);

      expect(result.toolName).toBe('get_journey_insights');
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data as any[]).length).toBeGreaterThan(0);
      expect(result.summary).toBeDefined();
      expect(result.sources.length).toBeGreaterThan(0);
    });

    it('getDoctorDiscussionPointsTool prepares structured discussion points for consultation', async () => {
      const result = await getDoctorDiscussionPointsTool(patientA.id);

      expect(result.toolName).toBe('get_doctor_discussion_points');
      const pointData = result.data as any;
      expect(Array.isArray(pointData.points)).toBe(true);
      expect(pointData.points.length).toBeGreaterThan(0);
      expect(result.summary).toContain('Recommended Discussion Points');
      expect(result.summary).toContain('licensed physician');
    });

    it('explainReminderTool explains reminder policy, categories, and quiet hours', async () => {
      const result = await explainReminderTool(patientA.id, 'Tell me about care reminders');

      expect(result.toolName).toBe('explain_reminder');
      expect(result.summary).toContain('Medication Reminders');
      expect(result.summary).toContain('Care Task Reminders');
      expect(result.summary).toContain('quiet hours');
      expect(result.sources.length).toBeGreaterThan(0);
    });

    it('POST /api/damu/interact responds to journey query grounded in progress summary and sets avatarMode: speaking', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'How is my health journey progress and adherence this month?',
          language: 'en-IN',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      expect(res.status).toBe(200);
      expect(res.body.avatarMode).toBe('speaking');
      expect(res.body.textResponse).toBeDefined();
      expect(res.body.textResponse.length).toBeGreaterThan(20);
      expect(res.body.sources.length).toBeGreaterThan(0);
    });
  });
});
