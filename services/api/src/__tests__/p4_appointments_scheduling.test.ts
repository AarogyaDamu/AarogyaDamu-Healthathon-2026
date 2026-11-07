import request from 'supertest';
import { app, prisma } from '../server';
import bcrypt from 'bcryptjs';

describe('Phase 4: Appointment Booking & Visit Management Suite', () => {
  let patientA: { id: string; email: string; token: string; fullName: string };
  let patientB: { id: string; email: string; token: string; fullName: string };
  let doctor1: { id: string; email: string; token: string; fullName: string };
  let doctor2: { id: string; email: string; token: string; fullName: string };
  let authorizedCaregiver: { id: string; email: string; token: string; fullName: string };
  let unauthorizedCaregiver: { id: string; email: string; token: string; fullName: string };

  let testAppointmentId: string;
  let futureSlotDate: string;
  let futureIsoTime: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('SecureHealthPass123!', 10);

    async function createUser(
      role: 'PATIENT' | 'DOCTOR' | 'CAREGIVER',
      name: string,
      isClinician = false
    ) {
      const email = `test.p4.${role.toLowerCase()}.${Date.now()}.${Math.random().toString(36).substring(7)}@aarogyadamu.test`;
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          isClinician,
          profile: {
            create: {
              fullName: name,
              diabetesType: role === 'PATIENT' ? 'TYPE_2_DIABETES' : undefined,
            },
          },
        },
      });

      const loginRes = await request(app).post('/api/auth/login').send({
        email,
        password: 'SecureHealthPass123!',
      });

      return {
        id: user.id,
        email: user.email,
        token: loginRes.body.token,
        fullName: name,
      };
    }

    patientA = await createUser('PATIENT', 'Rohan Mehra');
    patientB = await createUser('PATIENT', 'Deepika Rao');
    doctor1 = await createUser('DOCTOR', 'Dr. Arvind Joshi, MD (Apollo Sugar)', true);
    doctor2 = await createUser('DOCTOR', 'Dr. Meera Nambiar, MD', true);
    authorizedCaregiver = await createUser('CAREGIVER', 'Anita Mehra (Caregiver)');
    unauthorizedCaregiver = await createUser('CAREGIVER', 'Vijay Kumar (No Permission)');

    // Set up caregiver consent with VIEW_APPOINTMENTS
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: authorizedCaregiver.email,
        caregiverName: 'Anita Mehra',
        relationship: 'SPOUSE',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_APPOINTMENTS', 'VIEW_HEALTH_SUMMARY']),
        acceptedAt: new Date(),
      },
    });

    // Compute future date (next Wednesday at 10:00 AM UTC to ensure a weekday)
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // adjust to next Wednesday
    const day = d.getUTCDay();
    const diff = (3 - day + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + diff);
    const pad = (n: number) => String(n).padStart(2, '0');
    futureSlotDate = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    futureIsoTime = `${futureSlotDate}T10:00:00.000Z`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------
  // 1. Configurable 18-Question Pre-Consultation Assessment Questionnaire
  // -------------------------------------------------------------------------
  describe('1. Pre-Consultation Diabetes Assessment Protocol (Apollo Sugar Clinics aligned)', () => {
    it('returns the full 18-question protocol definition with clinical metadata and disclaimer', async () => {
      const res = await request(app)
        .get('/api/coordination/questionnaire')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.protocol).toContain('Pre-Consultation Diabetes Assessment');
      expect(res.body.alignment).toContain('Apollo Sugar Clinics');
      expect(res.body.disclaimer).toContain('does not provide medical diagnosis');
      expect(res.body.totalQuestions).toBe(18);
      expect(Array.isArray(res.body.questions)).toBe(true);
      expect(res.body.questions.length).toBe(18);

      // Verify sections: Section 1, Section 2, Section 3
      const section1 = res.body.questions.filter((q: any) => q.sectionNumber === 1);
      const section2 = res.body.questions.filter((q: any) => q.sectionNumber === 2);
      const section3 = res.body.questions.filter((q: any) => q.sectionNumber === 3);

      expect(section1.length).toBe(6);
      expect(section2.length).toBe(6);
      expect(section3.length).toBe(6);

      // Check clinical rationale on questions
      expect(section1[0].clinicalRationale).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Doctor Availability & Scheduling Engine
  // -------------------------------------------------------------------------
  describe('2. Doctor Availability & Scheduling Engine', () => {
    it('GET /api/coordination/doctors returns active clinicians with clinic details', async () => {
      const res = await request(app)
        .get('/api/coordination/doctors')
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.doctors)).toBe(true);
      const doc = res.body.doctors.find((d: any) => d.id === doctor1.id);
      expect(doc).toBeDefined();
      expect(doc.name).toBe(doctor1.fullName);
      expect(doc.clinicName).toBeDefined();
    });

    it('GET /api/coordination/doctors/:id/availability calculates available slots for a weekday', async () => {
      const res = await request(app)
        .get(`/api/coordination/doctors/${doctor1.id}/availability?date=${futureSlotDate}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.isWorkingDay).toBe(true);
      expect(res.body.doctorId).toBe(doctor1.id);
      expect(Array.isArray(res.body.slots)).toBe(true);
      expect(res.body.slots.length).toBeGreaterThan(0);

      const slot10 = res.body.slots.find((s: any) => s.startTime === '10:00');
      expect(slot10).toBeDefined();
      expect(slot10.available).toBe(true);
    });

    it('Doctor configures custom availability schedule via PUT /api/coordination/doctor/availability', async () => {
      const schedulePayload = [
        {
          dayOfWeek: 3, // Wednesday
          startTime: '10:00',
          endTime: '14:00',
          slotDurationMinutes: 30,
          isActive: true,
          clinicName: 'Apollo Sugar Clinic, Pune West',
        },
        {
          dayOfWeek: 0, // Sunday
          startTime: '09:00',
          endTime: '12:00',
          slotDurationMinutes: 30,
          isActive: false,
          clinicName: 'Apollo Sugar Clinic, Pune West',
        },
      ];

      const res = await request(app)
        .put('/api/coordination/doctor/availability')
        .set('Authorization', `Bearer ${doctor1.token}`)
        .send({ schedules: schedulePayload });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify availability reflects updated 10:00 - 14:00 window
      const availRes = await request(app)
        .get(`/api/coordination/doctors/${doctor1.id}/availability?date=${futureSlotDate}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(availRes.status).toBe(200);
      expect(availRes.body.clinicName).toBe('Apollo Sugar Clinic, Pune West');
      const slots = availRes.body.slots;
      expect(slots[0].startTime).toBe('10:00');
      expect(slots[slots.length - 1].endTime).toBe('14:00');
    });

    it('Doctor manages time-off / blocked days with conflict prevention', async () => {
      const leaveDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      const leaveDateStr = `${leaveDate.getUTCFullYear()}-${pad(leaveDate.getUTCMonth() + 1)}-${pad(leaveDate.getUTCDate())}`;

      // Schedule time off
      const timeOffRes = await request(app)
        .post('/api/coordination/doctor/time-off')
        .set('Authorization', `Bearer ${doctor1.token}`)
        .send({
          startDate: `${leaveDateStr}T00:00:00.000Z`,
          endDate: `${leaveDateStr}T23:59:59.999Z`,
          reason: 'Apollo Annual Diabetes Conference',
        });

      expect(timeOffRes.status).toBe(201);
      expect(timeOffRes.body.timeOff.id).toBeDefined();
      const timeOffId = timeOffRes.body.timeOff.id;

      // Check that availability on leave date marks slots unavailable with reason 'Doctor on leave'
      const availRes = await request(app)
        .get(`/api/coordination/doctors/${doctor1.id}/availability?date=${leaveDateStr}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(availRes.status).toBe(200);
      if (availRes.body.slots.length > 0) {
        expect(availRes.body.slots.every((s: any) => !s.available)).toBe(true);
        expect(availRes.body.slots[0].reason).toBe('Doctor on leave');
      }

      // Delete time off
      const delRes = await request(app)
        .delete(`/api/coordination/doctor/time-off/${timeOffId}`)
        .set('Authorization', `Bearer ${doctor1.token}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Patient Booking & Double-Booking Conflict Prevention
  // -------------------------------------------------------------------------
  describe('3. Patient Booking & Conflict Elimination', () => {
    it('Patient books appointment with clinic, visit type, reason, and 18-question responses', async () => {
      const intakeResponse = {
        primary_concern: 'Recent fasting blood sugar elevated above 140 mg/dL',
        diabetes_type: 'TYPE_2',
        diagnosis_duration: '3_TO_5_YEARS',
        recent_hba1c: 7.6,
        fasting_glucose_typical: 142,
        hypoglycemia_episodes: 'ONE_TO_TWO',
        dietary_pattern: 'MODERATE_CARB',
        physical_activity: 'LIGHT_WALK',
        medication_adherence: 'EXCELLENT',
        insulin_usage: 'NO_INSULIN',
        monitoring_frequency: 'TWICE_WEEKLY',
        alcohol_tobacco: 'NONE',
        neuropathy_symptoms: 'MILD_TINGLING',
        vision_changes: 'NO_CHANGES',
        cardiovascular_symptoms: 'NONE',
        kidney_status: 'NORMAL_LAST_CHECK',
        stress_sleep_quality: 'MODERATE_STRESS',
        consultation_goal: 'Optimize oral medication regimen',
      };

      const bookingRes = await request(app)
        .post('/api/coordination/appointments')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          doctorId: doctor1.id,
          scheduledAt: futureIsoTime,
          durationMinutes: 30,
          visitType: 'DIABETES_REVIEW',
          reason: 'Quarterly glycemic intake review and prescription refill discussion.',
          clinicName: 'Apollo Sugar Clinic, Pune West',
          questionnaireResponse: intakeResponse,
          idempotencyKey: `p4-book-${patientA.id}-${Date.now()}`,
        });

      expect(bookingRes.status).toBe(201);
      expect(bookingRes.body.appointment).toBeDefined();
      expect(bookingRes.body.appointment.status).toBe('REQUESTED');
      expect(bookingRes.body.appointment.clinicName).toBe('Apollo Sugar Clinic, Pune West');
      expect(bookingRes.body.appointment.questionnaireResponse).toBeDefined();
      expect(bookingRes.body.appointment.questionnaireResponse.recent_hba1c).toBe(7.6);

      testAppointmentId = bookingRes.body.appointment.id;

      // Verify care notification generated for doctor
      const notifs = await prisma.careNotification.findMany({
        where: { userId: doctor1.id, type: 'APPOINTMENT_REQUEST' },
      });
      expect(notifs.length).toBeGreaterThan(0);
    });

    it('Enforces transaction-safe conflict prevention: rejects overlapping booking with 409 Conflict', async () => {
      // PatientB tries to book same doctor at exact same time
      const conflictRes = await request(app)
        .post('/api/coordination/appointments')
        .set('Authorization', `Bearer ${patientB.token}`)
        .send({
          doctorId: doctor1.id,
          scheduledAt: futureIsoTime,
          durationMinutes: 30,
          visitType: 'CHECKUP',
          reason: 'Need routine checkup at same time',
          idempotencyKey: `p4-conflict-${Date.now()}`,
        });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.error).toContain('overlapping appointment');
    });

    it('Rejects appointment booking in the past', async () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const pastRes = await request(app)
        .post('/api/coordination/appointments')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          doctorId: doctor1.id,
          scheduledAt: pastTime,
          durationMinutes: 30,
          reason: 'Past consultation attempt',
        });

      expect(pastRes.status).toBe(400);
      expect(pastRes.body.error).toContain('future');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Doctor Appointment Management & Lifecycle Transitions
  // -------------------------------------------------------------------------
  describe('4. Doctor Appointment Management & Lifecycle', () => {
    it('Doctor confirms requested appointment and activates doctor-patient assignment', async () => {
      const confirmRes = await request(app)
        .patch(`/api/coordination/appointments/${testAppointmentId}/status`)
        .set('Authorization', `Bearer ${doctor1.token}`)
        .send({ status: 'CONFIRMED' });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.appointment.status).toBe('CONFIRMED');

      // Verify DoctorPatientAssignment is now ACTIVE
      const assignment = await prisma.doctorPatientAssignment.findUnique({
        where: {
          doctorId_patientId: {
            doctorId: doctor1.id,
            patientId: patientA.id,
          },
        },
      });
      expect(assignment?.status).toBe('ACTIVE');

      // Verify patient notification
      const patientNotif = await prisma.careNotification.findFirst({
        where: { userId: patientA.id, title: 'Appointment Confirmed' },
      });
      expect(patientNotif).toBeDefined();
    });

    it('Doctor reschedules appointment to a new slot', async () => {
      const [year, month, day] = futureSlotDate.split('-').map(Number);
      const newTime = new Date(Date.UTC(year, month - 1, day, 11, 0, 0)).toISOString();

      const rescheduleRes = await request(app)
        .patch(`/api/coordination/appointments/${testAppointmentId}/status`)
        .set('Authorization', `Bearer ${doctor1.token}`)
        .send({
          status: 'RESCHEDULED',
          newScheduledAt: newTime,
        });

      expect(rescheduleRes.status).toBe(200);
      expect(rescheduleRes.body.appointment.status).toBe('RESCHEDULED');
      expect(rescheduleRes.body.appointment.scheduledAt).toBe(newTime);
    });

    it('Doctor re-confirms rescheduled appointment', async () => {
      const confirmRes = await request(app)
        .patch(`/api/coordination/appointments/${testAppointmentId}/status`)
        .set('Authorization', `Bearer ${doctor1.token}`)
        .send({ status: 'CONFIRMED' });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.appointment.status).toBe('CONFIRMED');
    });

    it('Doctor marks confirmed appointment as COMPLETED with completion timestamp', async () => {
      const completeRes = await request(app)
        .patch(`/api/coordination/appointments/${testAppointmentId}/status`)
        .set('Authorization', `Bearer ${doctor1.token}`)
        .send({ status: 'COMPLETED' });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.appointment.status).toBe('COMPLETED');
      expect(completeRes.body.appointment.completedAt).toBeDefined();
    });

    it('Doctor declines a requested appointment with rejection reason', async () => {
      // Create a fresh requested appointment
      const d = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
      d.setHours(10, 0, 0, 0);
      const slotTime = d.toISOString();

      const bookRes = await request(app)
        .post('/api/coordination/appointments')
        .set('Authorization', `Bearer ${patientB.token}`)
        .send({
          doctorId: doctor1.id,
          scheduledAt: slotTime,
          durationMinutes: 30,
          reason: 'Initial consultation request',
        });

      const apptId = bookRes.body.appointment.id;

      // Doctor declines with reason
      const declineRes = await request(app)
        .patch(`/api/coordination/appointments/${apptId}/status`)
        .set('Authorization', `Bearer ${doctor1.token}`)
        .send({
          status: 'DECLINED',
          rejectionReason: 'Doctor is fully booked with emergency cases.',
        });

      expect(declineRes.status).toBe(200);
      expect(declineRes.body.appointment.status).toBe('DECLINED');
      expect(declineRes.body.appointment.rejectionReason).toBe('Doctor is fully booked with emergency cases.');
    });

    it('Doctor cannot modify an appointment belonging to another doctor', async () => {
      // Doctor2 tries to modify Doctor1's appointment
      const unauthorizedRes = await request(app)
        .patch(`/api/coordination/appointments/${testAppointmentId}/status`)
        .set('Authorization', `Bearer ${doctor2.token}`)
        .send({ status: 'CONFIRMED' });

      expect(unauthorizedRes.status).toBe(403);
      expect(unauthorizedRes.body.error).toContain('another doctor');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Patient Cancellation & Boundaries
  // -------------------------------------------------------------------------
  describe('5. Patient Cancellation & Action Boundaries', () => {
    it('Patient cancels their upcoming appointment with cancellation note', async () => {
      const d = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);
      d.setHours(11, 0, 0, 0);

      const bookRes = await request(app)
        .post('/api/coordination/appointments')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          doctorId: doctor1.id,
          scheduledAt: d.toISOString(),
          durationMinutes: 30,
          reason: 'Dietary intake follow up',
        });

      const apptId = bookRes.body.appointment.id;

      const cancelRes = await request(app)
        .patch(`/api/coordination/appointments/${apptId}/status`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          status: 'CANCELLED',
          cancellationReason: 'Patient travel emergency',
        });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.appointment.status).toBe('CANCELLED');
      expect(cancelRes.body.appointment.cancellationReason).toBe('Patient travel emergency');
    });

    it('Patient cannot arbitrarily set status to CONFIRMED or COMPLETED', async () => {
      const d = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      d.setHours(12, 0, 0, 0);

      const bookRes = await request(app)
        .post('/api/coordination/appointments')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          doctorId: doctor1.id,
          scheduledAt: d.toISOString(),
          durationMinutes: 30,
          reason: 'Self-confirm attempt test',
        });

      const apptId = bookRes.body.appointment.id;

      const hackRes = await request(app)
        .patch(`/api/coordination/appointments/${apptId}/status`)
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({ status: 'CONFIRMED' });

      expect(hackRes.status).toBe(403);
      expect(hackRes.body.error).toContain('Only the assigned doctor');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Caregiver Integration & Sensitive Intake Masking
  // -------------------------------------------------------------------------
  describe('6. Caregiver Integration & Privacy Boundary', () => {
    it('Caregiver with VIEW_APPOINTMENTS can view dependent appointments with questionnaire masked', async () => {
      const res = await request(app)
        .get(`/api/coordination/appointments?patientId=${patientA.id}`)
        .set('Authorization', `Bearer ${authorizedCaregiver.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.appointments)).toBe(true);
      expect(res.body.appointments.length).toBeGreaterThan(0);

      // Verify sensitive questionnaireResponse is masked (null) for caregiver
      res.body.appointments.forEach((appt: any) => {
        expect(appt.questionnaireResponse).toBeNull();
      });
    });

    it('Caregiver via dedicated /api/caregivers/patients/:patientId/appointments endpoint receives appointment list', async () => {
      const res = await request(app)
        .get(`/api/caregivers/patients/${patientA.id}/appointments`)
        .set('Authorization', `Bearer ${authorizedCaregiver.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.appointments)).toBe(true);
      expect(res.body.appointments[0].clinicName).toBeDefined();
    });

    it('Caregiver without VIEW_APPOINTMENTS permission receives 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/coordination/appointments?patientId=${patientA.id}`)
        .set('Authorization', `Bearer ${unauthorizedCaregiver.token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('requires explicit caregiver permission');
    });
  });

  // -------------------------------------------------------------------------
  // 7. Query Filters & Health Timeline Integration
  // -------------------------------------------------------------------------
  describe('7. Query Filters & Timeline Integration', () => {
    it('Filters appointments by filter=REQUESTS and filter=HISTORY', async () => {
      const requestsRes = await request(app)
        .get('/api/coordination/appointments?filter=REQUESTS')
        .set('Authorization', `Bearer ${doctor1.token}`);

      expect(requestsRes.status).toBe(200);
      requestsRes.body.appointments.forEach((a: any) => {
        expect(a.status).toBe('REQUESTED');
      });

      const historyRes = await request(app)
        .get('/api/coordination/appointments?filter=HISTORY')
        .set('Authorization', `Bearer ${doctor1.token}`);

      expect(historyRes.status).toBe(200);
      historyRes.body.appointments.forEach((a: any) => {
        expect(['COMPLETED', 'CANCELLED', 'DECLINED', 'MISSED']).toContain(a.status);
      });
    });

    it('GET /api/journey/history integrates appointment event with singular event ID', async () => {
      const historyRes = await request(app)
        .get(`/api/journey/history?patientId=${patientA.id}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(historyRes.status).toBe(200);
      expect(Array.isArray(historyRes.body.history)).toBe(true);

      const apptEvent = historyRes.body.history.find(
        (e: any) => e.eventType === 'APPOINTMENT' && e.id === `appt-${testAppointmentId}`
      );
      expect(apptEvent).toBeDefined();
      expect(apptEvent.summary).toContain('Status: COMPLETED');
    });

    it('GET /api/journey/timeline reflects doctor follow-up appointment stage', async () => {
      const timelineRes = await request(app)
        .get(`/api/journey/timeline?patientId=${patientA.id}`)
        .set('Authorization', `Bearer ${patientA.token}`);

      expect(timelineRes.status).toBe(200);
      expect(Array.isArray(timelineRes.body.stages)).toBe(true);
      const stage8 = timelineRes.body.stages.find((s: any) => s.id === 'DOCTOR_FOLLOW_UP');
      expect(stage8).toBeDefined();
    });
  });
});
