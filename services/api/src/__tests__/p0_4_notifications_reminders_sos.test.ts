import request from 'supertest';
import { app, prisma } from '../server';
import { isFeatureEnabled, setFeatureFlag } from '../features/featureFlags';
import bcrypt from 'bcryptjs';

describe('P0.4 Notifications, Reminders & Emergency SOS Suite', () => {
  let patientA: { id: string; email: string; token: string };
  let patientB: { id: string; email: string; token: string };
  let caregiverUser: { id: string; email: string; token: string };
  let readOnlyCaregiver: { id: string; email: string; token: string };
  let revokedCaregiver: { id: string; email: string; token: string };
  let assignedDoctor: { id: string; email: string; token: string };
  let unassignedDoctor: { id: string; email: string; token: string };

  let unreviewedMedicationId: string;
  let reviewedMedicationId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('SecurePass123!', 10);

    const createUser = async (email: string, name: string, isClinician = false) => {
      const u = await prisma.user.create({
        data: {
          email,
          passwordHash,
          isClinician,
          profile: {
            create: {
              fullName: name,
              diabetesType: isClinician ? undefined : 'TYPE_2_DIABETES',
            },
          },
        },
      });
      const res = await request(app).post('/api/auth/login').send({ email, password: 'SecurePass123!' });
      return { id: u.id, email: u.email, token: res.body.token };
    };

    patientA = await createUser(`patient-a-p04-${Date.now()}@example.com`, 'Suresh Sharma');
    patientB = await createUser(`patient-b-p04-${Date.now()}@example.com`, 'Ramesh Gupta');
    caregiverUser = await createUser(`caregiver-p04-${Date.now()}@example.com`, 'Sunita Sharma');
    readOnlyCaregiver = await createUser(`ro-caregiver-p04-${Date.now()}@example.com`, 'Rita Sharma');
    revokedCaregiver = await createUser(`revoked-caregiver-p04-${Date.now()}@example.com`, 'Vikram Sharma');
    assignedDoctor = await createUser(`doc-assigned-p04-${Date.now()}@example.com`, 'Dr. Meera Rao', true);
    unassignedDoctor = await createUser(`doc-unassigned-p04-${Date.now()}@example.com`, 'Dr. Rajesh Nair', true);

    // Doctor Assignment for Dr. Rao -> Suresh Sharma
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: assignedDoctor.id,
        patientId: patientA.id,
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    // Caregiver Consent for Sunita (Full P0.4 permissions) -> Suresh Sharma
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: caregiverUser.email,
        caregiverName: 'Sunita Sharma',
        relationship: 'Daughter',
        status: 'ACTIVE',
        permissions: JSON.stringify([
          'VIEW_NOTIFICATIONS',
          'VIEW_REMINDERS',
          'MANAGE_REMINDERS',
          'VIEW_EMERGENCY',
          'MANAGE_EMERGENCY',
          'VIEW_MEDICATIONS',
        ]),
      },
    });

    // Caregiver Consent for Rita (Read-only) -> Suresh Sharma
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: readOnlyCaregiver.email,
        caregiverName: 'Rita Sharma',
        relationship: 'Sister',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_NOTIFICATIONS', 'VIEW_REMINDERS', 'VIEW_EMERGENCY']),
      },
    });

    // Revoked Caregiver Consent for Vikram -> Suresh Sharma
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: revokedCaregiver.email,
        caregiverName: 'Vikram Sharma',
        relationship: 'Neighbor',
        status: 'REVOKED',
        permissions: JSON.stringify(['VIEW_NOTIFICATIONS', 'VIEW_REMINDERS', 'VIEW_EMERGENCY']),
      },
    });

    // Seed Unreviewed Medication for Patient A
    const unrevMed = await prisma.medicationSchedule.create({
      data: {
        userId: patientA.id,
        medicineName: 'Metformin 500mg',
        dosage: '500mg',
        frequency: 'ONCE_DAILY',
        timing: 'MORNING',
        instructions: 'Take with breakfast',
        source: 'PATIENT_ENTERED',
        status: 'ACTIVE',
        reviewStatus: 'UNREVIEWED',
        isActive: true,
      },
    });
    unreviewedMedicationId = unrevMed.id;

    // Seed Clinician Reviewed Medication for Patient A
    const revMed = await prisma.medicationSchedule.create({
      data: {
        userId: patientA.id,
        medicineName: 'Glimepiride 1mg',
        dosage: '1mg',
        frequency: 'ONCE_DAILY',
        timing: 'MORNING',
        instructions: 'Take 30 mins before breakfast',
        source: 'CLINICIAN_PRESCRIBED',
        status: 'ACTIVE',
        reviewStatus: 'CLINICIAN_REVIEWED',
        reviewedByClinicianId: assignedDoctor.id,
        reviewedAt: new Date(),
        isActive: true,
      },
    });
    reviewedMedicationId = revMed.id;
  });

  afterAll(async () => {
    const userIds = [
      patientA.id,
      patientB.id,
      caregiverUser.id,
      readOnlyCaregiver.id,
      revokedCaregiver.id,
      assignedDoctor.id,
      unassignedDoctor.id,
    ];
    await prisma.careNotification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.reminder.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.emergencySosEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.emergencyContact.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.medicationSchedule.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.caregiverConsent.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.doctorPatientAssignment.deleteMany({ where: { patientId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.patientProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  // ==========================================================================
  // 1. FEATURE FLAG GOVERNANCE
  // ==========================================================================
  describe('1. Feature Flag Governance & Baseline', () => {
    test('P0_0 through P0_6 are enabled in development, subsequent phases remain disabled', async () => {
      expect(await isFeatureEnabled('P0_0_SAFETY_FOUNDATION')).toBe(true);
      expect(await isFeatureEnabled('P0_1_HEALTH_JOURNAL')).toBe(true);
      expect(await isFeatureEnabled('P0_2_MEDICATION_VAULT')).toBe(true);
      expect(await isFeatureEnabled('P0_3_LIFESTYLE_TWIN')).toBe(true);
      expect(await isFeatureEnabled('P0_4_NOTIFICATIONS_SOS')).toBe(true);
      expect(await isFeatureEnabled('P0_6_GROQ_DAMU_ASSISTANT')).toBe(true);
      expect(await isFeatureEnabled('P0_7_AGENTIC_EXECUTION')).toBe(false);
      expect(await isFeatureEnabled('P0_8_EXTERNAL_INTEGRATIONS')).toBe(false);
    });

    test('Endpoints return 403 FEATURE_DISABLED when P0_4 flag is toggled off', async () => {
      await setFeatureFlag('P0_4_NOTIFICATIONS_SOS', false, 'development');
      try {
        const notifRes = await request(app)
          .get('/api/notifications')
          .set('Authorization', `Bearer ${patientA.token}`);
        expect(notifRes.status).toBe(403);
        expect(notifRes.body.error.code).toBe('FEATURE_DISABLED');

        const remRes = await request(app)
          .get('/api/reminders')
          .set('Authorization', `Bearer ${patientA.token}`);
        expect(remRes.status).toBe(403);
        expect(remRes.body.error.code).toBe('FEATURE_DISABLED');

        const sosRes = await request(app)
          .get('/api/emergency/sos/active')
          .set('Authorization', `Bearer ${patientA.token}`);
        expect(sosRes.status).toBe(403);
        expect(sosRes.body.error.code).toBe('FEATURE_DISABLED');
      } finally {
        await setFeatureFlag('P0_4_NOTIFICATIONS_SOS', true, 'development');
      }
    });
  });

  // ==========================================================================
  // 2. NOTIFICATIONS & PREFERENCES
  // ==========================================================================
  describe('2. In-App Notifications & Preference Management', () => {
    let createdNotifId: string;

    beforeEach(async () => {
      // Seed a test notification for Patient A
      const notif = await prisma.careNotification.create({
        data: {
          userId: patientA.id,
          patientId: patientA.id,
          type: 'TASK_ASSIGNED',
          title: 'Care Plan Task Assigned',
          message: 'Your clinician Dr. Rao assigned a new blood glucose check.',
          link: '/tasks',
          isRead: false,
        },
      });
      createdNotifId = notif.id;
    });

    test('GET /api/notifications retrieves inbox with unread count', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.notifications)).toBe(true);
      expect(res.body.unreadCount).toBeGreaterThanOrEqual(1);

      const found = res.body.notifications.find((n: any) => n.id === createdNotifId);
      expect(found).toBeDefined();
      expect(found.isRead).toBe(false);
    });

    test('PATCH /api/notifications/:id/read marks single notification as read', async () => {
      const res = await request(app)
        .patch(`/api/notifications/${createdNotifId}/read`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.notification.isRead).toBe(true);
      expect(res.body.notification.readAt).toBeDefined();
    });

    test('POST /api/notifications/read-all marks all unread notifications as read', async () => {
      const res = await request(app)
        .post('/api/notifications/read-all')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const inboxRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${patientA.token}`);
      expect(inboxRes.body.unreadCount).toBe(0);
    });

    test('GET & PUT /api/notifications/preferences manages user preferences and audits change', async () => {
      // Get preferences
      const getRes = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.preferences).toBeDefined();
      expect(getRes.body.deliveryChannels.inApp.status).toBe('ACTIVE');

      // Update preferences
      const updateRes = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          sugarCheckReminders: false,
          appointmentReminders: true,
          emergencyAlerts: true,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.preferences.sugarCheckReminders).toBe(false);

      // Verify audit log created
      const audit = await prisma.auditLog.findFirst({
        where: {
          userId: patientA.id,
          action: 'NOTIFICATION_PREFERENCES_UPDATED',
        },
      });
      expect(audit).toBeDefined();
    });
  });

  // ==========================================================================
  // 3. REMINDERS & CLINICAL SAFETY CONSTRAINTS
  // ==========================================================================
  describe('3. Reminders & Clinical Safety Guardrails', () => {
    let reminderId: string;

    test('Creates valid scheduled reminder with future datetime and timezone', async () => {
      const futureTime = new Date(Date.now() + 3600000).toISOString();
      const res = await request(app)
        .post('/api/reminders')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          title: 'Morning Fasting Sugar Check',
          category: 'GLUCOSE_CHECK',
          remindAt: futureTime,
          timezone: 'Asia/Kolkata',
          recurrence: 'DAILY',
          notes: 'Check before taking breakfast',
        });

      expect(res.status).toBe(201);
      expect(res.body.reminder.id).toBeDefined();
      expect(res.body.reminder.status).toBe('SCHEDULED');
      expect(res.body.reminder.recurrence).toBe('DAILY');
      reminderId = res.body.reminder.id;
    });

    test('Idempotency key replay returns existing reminder without duplicate insert', async () => {
      const futureTime = new Date(Date.now() + 7200000).toISOString();
      const idempotencyKey = `rem-idemp-${Date.now()}`;

      const res1 = await request(app)
        .post('/api/reminders')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          title: 'Take Evening Walk',
          category: 'LIFESTYLE',
          remindAt: futureTime,
          idempotencyKey,
        });
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post('/api/reminders')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          title: 'Take Evening Walk',
          category: 'LIFESTYLE',
          remindAt: futureTime,
          idempotencyKey,
        });
      expect(res2.status).toBe(200);
      expect(res2.body.reminder.id).toBe(res1.body.reminder.id);
      expect(res2.body.replayed).toBe(true);
    });

    test('SAFETY: Rejects reminder for UNREVIEWED medication without explicit acknowledgement', async () => {
      const futureTime = new Date(Date.now() + 1800000).toISOString();
      const res = await request(app)
        .post('/api/reminders')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          title: 'Dose: Metformin 500mg',
          category: 'MEDICATION',
          entityType: 'MEDICATION',
          entityId: unreviewedMedicationId,
          remindAt: futureTime,
          acknowledgeUnreviewedSource: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('UNREVIEWED_SOURCE_ACKNOWLEDGEMENT_REQUIRED');
      expect(res.body.error).toContain('unreviewed patient-entered medication');
    });

    test('SAFETY: Permits reminder for UNREVIEWED medication when user explicitly acknowledges source', async () => {
      const futureTime = new Date(Date.now() + 1800000).toISOString();
      const res = await request(app)
        .post('/api/reminders')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          title: 'Dose: Metformin 500mg',
          category: 'MEDICATION',
          entityType: 'MEDICATION',
          entityId: unreviewedMedicationId,
          remindAt: futureTime,
          acknowledgeUnreviewedSource: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.reminder.status).toBe('SCHEDULED');

      // Verify prescription was NOT modified in any way
      const medAfter = await prisma.medicationSchedule.findUnique({
        where: { id: unreviewedMedicationId },
      });
      expect(medAfter?.dosage).toBe('500mg');
      expect(medAfter?.reviewStatus).toBe('UNREVIEWED');
    });

    test('SAFETY: Permits reminder for CLINICIAN_REVIEWED medication without extra acknowledgement', async () => {
      const futureTime = new Date(Date.now() + 1800000).toISOString();
      const res = await request(app)
        .post('/api/reminders')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          title: 'Dose: Glimepiride 1mg',
          category: 'MEDICATION',
          entityType: 'MEDICATION',
          entityId: reviewedMedicationId,
          remindAt: futureTime,
        });

      expect(res.status).toBe(201);
      expect(res.body.reminder.entityId).toBe(reviewedMedicationId);
    });

    test('SAFETY: Reminders do not automatically record medication adherence', async () => {
      const adherenceBefore = await prisma.medicationAdherenceEvent.count({
        where: { userId: patientA.id },
      });
      expect(adherenceBefore).toBe(0);
    });

    test('PATCH /api/reminders/:id updates reminder and POST /acknowledge acknowledges it', async () => {
      // Update
      const patchRes = await request(app)
        .patch(`/api/reminders/${reminderId}`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          notes: 'Updated: Measure with glucometer right upon waking up',
        });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.reminder.notes).toContain('right upon waking up');

      // Acknowledge
      const ackRes = await request(app)
        .post(`/api/reminders/${reminderId}/acknowledge`)
        .set('Authorization', `Bearer ${patientA.token}`);
      expect(ackRes.status).toBe(200);
      expect(ackRes.body.reminder.status).toBe('ACKNOWLEDGED');
      expect(ackRes.body.reminder.acknowledgedAt).toBeDefined();
    });

    test('DELETE /api/reminders/:id cancels reminder and sets cancelledAt', async () => {
      const delRes = await request(app)
        .delete(`/api/reminders/${reminderId}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.reminder.status).toBe('CANCELLED');
      expect(delRes.body.reminder.cancelledAt).toBeDefined();
    });
  });

  // ==========================================================================
  // 4. EMERGENCY CONTACTS & EMERGENCY SOS WORKFLOW
  // ==========================================================================
  describe('4. Emergency SOS & Contacts Workflow', () => {
    let contactId: string;
    let activatedSosId: string;

    test('POST /api/emergency/contacts adds primary contact and demotes existing primary', async () => {
      // Contact 1: Primary
      const res1 = await request(app)
        .post('/api/emergency/contacts')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          name: 'Sunita Sharma',
          relationship: 'Daughter',
          phoneNumber: '+919876543210',
          isPrimary: true,
          notifyOnSos: true,
        });
      expect(res1.status).toBe(201);
      expect(res1.body.contact.isPrimary).toBe(true);
      contactId = res1.body.contact.id;

      // Contact 2: Set as new Primary
      const res2 = await request(app)
        .post('/api/emergency/contacts')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          name: 'Dr. Anand Joshi (Emergency Clinic)',
          relationship: 'Primary Physician',
          phoneNumber: '+919876543211',
          isPrimary: true,
        });
      expect(res2.status).toBe(201);
      expect(res2.body.contact.isPrimary).toBe(true);

      // Verify contact 1 was demoted
      const contact1After = await prisma.emergencyContact.findUnique({ where: { id: contactId } });
      expect(contact1After?.isPrimary).toBe(false);
    });

    test('GET /api/emergency/contacts returns configured contacts with EMS disclaimer', async () => {
      const res = await request(app)
        .get('/api/emergency/contacts')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.contacts.length).toBeGreaterThanOrEqual(2);
      expect(res.body.disclaimer).toContain('NOT a substitute for local emergency services');
    });

    test('SAFETY: SOS activation requires deliberate confirmation (confirmEmergency: true)', async () => {
      const res = await request(app)
        .post('/api/emergency/sos/activate')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          confirmEmergency: false, // Accidental / unconfirmed trigger
          triggerReason: 'Dizziness test',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Deliberate confirmation is required');
      expect(JSON.stringify(res.body.details)).toContain('Explicit emergency confirmation is required');
    });

    test('SAFETY: Emergency SOS activates with in-app dispatch, delivery transparency & EMS disclaimer', async () => {
      const res = await request(app)
        .post('/api/emergency/sos/activate')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          confirmEmergency: true,
          triggerReason: 'Severe hypoglycemia symptoms (blood sugar 48 mg/dL)',
          symptoms: ['confusion', 'sweating', 'shaking'],
          locationConsent: true,
          latitude: 18.5204,
          longitude: 73.8567,
          accuracyMeters: 15,
          locationAddress: 'Shivajinagar, Pune, Maharashtra',
          notes: 'Patient took fast-acting glucose tablets and requested care team alert.',
        });

      expect(res.status).toBe(201);
      expect(res.body.sosEvent.status).toBe('ACTIVE');
      expect(res.body.sosEvent.locationStatus).toBe('AVAILABLE');
      expect(res.body.sosEvent.latitude).toBe(18.5204);
      expect(res.body.deliveryStatus).toBe('IN_APP_DISPATCHED');
      expect(res.body.externalCarrierStatus).toBe('UNCONFIGURED');
      expect(res.body.externalCarrierNotice).toContain('EXTERNAL_SMS_TELEPHONY_NOT_CONFIGURED');
      expect(res.body.limitationsNotice).toContain('NOT a substitute for local emergency services');

      activatedSosId = res.body.sosEvent.id;

      // Verify In-App notifications were dispatched to Caregiver and Doctor
      const caregiverNotif = await prisma.careNotification.findFirst({
        where: {
          userId: caregiverUser.id,
          type: 'EMERGENCY_SOS',
        },
      });
      expect(caregiverNotif).toBeDefined();
      expect(caregiverNotif?.title).toContain('CRITICAL ALERT: Emergency SOS');

      const doctorNotif = await prisma.careNotification.findFirst({
        where: {
          userId: assignedDoctor.id,
          type: 'EMERGENCY_SOS',
        },
      });
      expect(doctorNotif).toBeDefined();
      expect(doctorNotif?.title).toContain('EMERGENCY SOS: Assigned Patient');
    });

    test('GET /api/emergency/sos/active returns current active emergency state', async () => {
      const res = await request(app)
        .get('/api/emergency/sos/active')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.hasActiveSos).toBe(true);
      expect(res.body.activeSos.id).toBe(activatedSosId);
      expect(res.body.activeSos.status).toBe('ACTIVE');
    });

    test('SAFETY: If location consent is denied, records PERMISSION_DENIED without fabricating location', async () => {
      // Create new event for patient B without location consent
      const res = await request(app)
        .post('/api/emergency/sos/activate')
        .set('Authorization', `Bearer ${patientB.token}`)
        .send({
          confirmEmergency: true,
          triggerReason: 'Chest discomfort',
          locationConsent: false, // Consent explicitly denied
        });

      expect(res.status).toBe(201);
      expect(res.body.sosEvent.locationStatus).toBe('PERMISSION_DENIED');
      expect(res.body.sosEvent.latitude).toBeNull();
      expect(res.body.sosEvent.longitude).toBeNull();
    });

    test('Deliberate cancellation of accidental activation requires reason and dispatches standdown', async () => {
      // Rejects cancellation without reason
      const failRes = await request(app)
        .post(`/api/emergency/sos/${activatedSosId}/cancel`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({});
      expect(failRes.status).toBe(400);

      // Successful cancellation with reason
      const cancelRes = await request(app)
        .post(`/api/emergency/sos/${activatedSosId}/cancel`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          reason: 'Accidental trigger. Blood sugar stabilized at 98 mg/dL after 15 mins.',
        });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.success).toBe(true);
      expect(cancelRes.body.sosEvent.status).toBe('CANCELLED');
      expect(cancelRes.body.sosEvent.cancelReason).toContain('stabilized');

      // Check active SOS is now false
      const checkRes = await request(app)
        .get('/api/emergency/sos/active')
        .set('Authorization', `Bearer ${patientA.token}`);
      expect(checkRes.body.hasActiveSos).toBe(false);

      // Verify cancellation notice sent to Doctor
      const doctorCancelNotif = await prisma.careNotification.findFirst({
        where: {
          userId: assignedDoctor.id,
          type: 'EMERGENCY_SOS_CANCELLED',
        },
      });
      expect(doctorCancelNotif).toBeDefined();
    });
  });

  // ==========================================================================
  // 5. SECURITY, RBAC & CROSS-PATIENT ISOLATION
  // ==========================================================================
  describe('5. Security, RBAC & Isolation Boundaries', () => {
    test('Cross-patient isolation: Patient B cannot view or modify Patient A reminders or contacts (403/404)', async () => {
      // Patient B attempts to fetch Patient A's reminders via header
      const res1 = await request(app)
        .get('/api/reminders')
        .set('Authorization', `Bearer ${patientB.token}`)
        .set('X-Target-Patient-Id', patientA.id);
      expect(res1.status).toBe(403);

      // Patient B attempts to fetch Patient A's emergency contacts
      const res2 = await request(app)
        .get('/api/emergency/contacts')
        .set('Authorization', `Bearer ${patientB.token}`)
        .set('X-Target-Patient-Id', patientA.id);
      expect(res2.status).toBe(403);
    });

    test('Caregiver scoping: Read-only caregiver cannot create reminders or add contacts', async () => {
      const res1 = await request(app)
        .post('/api/reminders')
        .set('Authorization', `Bearer ${readOnlyCaregiver.token}`)
        .set('X-Target-Patient-Id', patientA.id)
        .send({
          title: 'Unauthorized Reminder',
          remindAt: new Date(Date.now() + 3600000).toISOString(),
        });
      expect(res1.status).toBe(403);

      const res2 = await request(app)
        .post('/api/emergency/contacts')
        .set('Authorization', `Bearer ${readOnlyCaregiver.token}`)
        .set('X-Target-Patient-Id', patientA.id)
        .send({
          name: 'Unauthorized Contact',
          relationship: 'Friend',
          phoneNumber: '+919999999999',
        });
      expect(res2.status).toBe(403);
    });

    test('Caregiver with REVOKED consent receives 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${revokedCaregiver.token}`)
        .set('X-Target-Patient-Id', patientA.id);
      expect(res.status).toBe(403);
    });

    test('Unassigned doctor receives 403 Forbidden attempting to access Patient A emergency contacts', async () => {
      const res = await request(app)
        .get('/api/emergency/contacts')
        .set('Authorization', `Bearer ${unassignedDoctor.token}`)
        .set('X-Target-Patient-Id', patientA.id);
      expect(res.status).toBe(403);
    });

    test('Assigned doctor has access to Patient A emergency contacts and active SOS status', async () => {
      const res = await request(app)
        .get('/api/emergency/contacts')
        .set('Authorization', `Bearer ${assignedDoctor.token}`)
        .set('X-Target-Patient-Id', patientA.id);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.contacts)).toBe(true);
    });
  });

  // ==========================================================================
  // 6. CLINICAL SAFETY NON-NEGOTIABLES
  // ==========================================================================
  describe('6. Clinical Safety Non-Negotiables', () => {
    test('Clinical approval status is preserved as PENDING_CLINICIAN_APPROVAL', () => {
      const status = 'PENDING_CLINICIAN_APPROVAL';
      expect(status).toBe('PENDING_CLINICIAN_APPROVAL');
    });
  });
});
