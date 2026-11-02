import request from 'supertest';
import { randomUUID } from 'crypto';
import { app, prisma } from '../server';

describe('Care coordination persistence and permissions', () => {
  let patient: any, caregiver: any, doctor: any, stranger: any;
  const auth = (user: any) => `Bearer ${user.token}`;
  async function register(label: string) {
    const response = await request(app).post('/api/auth/register').send({
      email: `${label.replace(/\s+/g, '-')}.${randomUUID()}@test.local`, password: 'Password123!', fullName: label,
    });
    expect(response.status).toBe(201);
    return { token: response.body.token, ...response.body.user };
  }
  beforeAll(async () => {
    patient = await register('Patient'); caregiver = await register('Caregiver');
    doctor = await register('Doctor'); stranger = await register('Stranger');
    await prisma.user.update({ where: { id: doctor.id }, data: { isClinician: true } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  test('consent controls booking and confirmation activates only the assigned doctor relationship', async () => {
    const booking = { patientId: patient.id, doctorId: doctor.id, scheduledAt: new Date(Date.now() + 86400000).toISOString(), reason: 'Diabetes follow-up', idempotencyKey: randomUUID() };
    const denied = await request(app).post('/api/coordination/appointments').set('Authorization', auth(caregiver)).send(booking);
    expect(denied.status).toBe(403);
    const grant = await request(app).post('/api/consents').set('Authorization', auth(patient)).send({ caregiverEmail: caregiver.email, caregiverName: 'Caregiver', relationship: 'Family', permissions: ['MANAGE_CONSULTATIONS'] });
    expect(grant.status).toBe(201);
    expect((await request(app).get('/api/observations').set('Authorization', auth(caregiver)).set('X-Target-Patient-Id', patient.id)).status).toBe(403);
    expect((await request(app).post('/api/consents').set('Authorization', auth(patient)).send({ caregiverEmail: caregiver.email, caregiverName: 'Caregiver', relationship: 'Family', permissions: ['VIEW_OBSERVATIONS'] })).status).toBe(409);
    const created = await request(app).post('/api/coordination/appointments').set('Authorization', auth(caregiver)).send(booking);
    expect(created.status).toBe(201);
    expect(created.body.appointment.status).toBe('REQUESTED');
    expect((await prisma.doctorPatientAssignment.findUnique({ where: { doctorId_patientId: { doctorId: doctor.id, patientId: patient.id } } }))?.status).toBe('PENDING');
    const id = created.body.appointment.id;
    expect((await request(app).patch(`/api/coordination/appointments/${id}/status`).set('Authorization', auth(stranger)).send({ status: 'CONFIRMED' })).status).toBe(403);
    expect((await request(app).patch(`/api/coordination/appointments/${id}/status`).set('Authorization', auth(doctor)).send({ status: 'CONFIRMED' })).status).toBe(200);
    expect((await prisma.doctorPatientAssignment.findUnique({ where: { doctorId_patientId: { doctorId: doctor.id, patientId: patient.id } } }))?.status).toBe('ACTIVE');
    expect((await request(app).get('/api/coordination/doctor/patients').set('Authorization', auth(doctor))).body.patients.some((p: any) => p.patientId === patient.id)).toBe(true);
    expect((await request(app).get(`/api/coordination/appointments?patientId=${patient.id}`).set('Authorization', auth(caregiver))).body.appointments.some((a: any) => a.id === id && a.status === 'CONFIRMED')).toBe(true);
    expect((await request(app).delete(`/api/consents/${grant.body.consent.id}`).set('Authorization', auth(stranger))).status).toBe(404);
    expect((await request(app).delete(`/api/consents/${grant.body.consent.id}`).set('Authorization', auth(patient))).status).toBe(200);
    expect((await request(app).get(`/api/coordination/appointments?patientId=${patient.id}`).set('Authorization', auth(caregiver))).status).toBe(403);
    expect((await request(app).patch(`/api/coordination/appointments/${id}/status`).set('Authorization', auth(caregiver)).send({ status: 'CANCELLED' })).status).toBe(403);
    expect((await prisma.appointment.findUnique({ where: { id } }))?.status).toBe('CONFIRMED');
  });

  test('Damu reads persisted glucose and a confirmed reminder becomes a task', async () => {
    const observation = await request(app).post('/api/observations').set('Authorization', auth(patient)).send({ numericValue: 123, unit: 'mg/dL', context: 'FASTING' });
    expect(observation.status).toBe(201);
    const glucose = await request(app).post('/api/assistant/query').set('Authorization', auth(patient)).send({ prompt: 'show my glucose' });
    expect(glucose.status).toBe(200);
    expect(glucose.body.records.items.some((item: any) => item.id === observation.body.observation.id)).toBe(true);
    const timeline = await request(app).get('/api/timeline').set('Authorization', auth(patient));
    expect(timeline.status).toBe(200);
    expect(timeline.body.events.some((event: any) => event.id === `obs-${observation.body.observation.id}`)).toBe(true);
    const proposal = await request(app).post('/api/assistant/query').set('Authorization', auth(patient)).send({ prompt: 'create a reminder' });
    expect(proposal.status).toBe(200);
    expect((await request(app).post(`/api/assistant/proposals/${proposal.body.proposal.id}/confirm`).set('Authorization', auth(patient))).status).toBe(200);
    expect(await prisma.careTask.findFirst({ where: { userId: patient.id, title: 'Check fasting blood glucose' } })).not.toBeNull();
  });

  test('expired and read-only grants cannot manage appointments; doctors cannot schedule unassigned patients', async () => {
    const other = await register('Other Patient');
    const body = { patientId: other.id, doctorId: doctor.id, scheduledAt: new Date(Date.now() + 172800000).toISOString(), reason: 'Follow up' };
    const grant = await request(app).post('/api/consents').set('Authorization', auth(other)).send({ caregiverEmail: caregiver.email, caregiverName: 'Caregiver', relationship: 'Family', permissions: ['VIEW_OBSERVATIONS'] });
    expect(grant.status).toBe(201);
    expect((await request(app).get('/api/observations').set('Authorization', auth(caregiver)).set('X-Target-Patient-Id', other.id)).status).toBe(200);
    expect((await request(app).post('/api/coordination/appointments').set('Authorization', auth(caregiver)).send(body)).status).toBe(403);
    await prisma.caregiverConsent.update({ where: { id: grant.body.consent.id }, data: { permissions: JSON.stringify(['MANAGE_CONSULTATIONS']), expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).post('/api/coordination/appointments').set('Authorization', auth(caregiver)).send(body)).status).toBe(403);
    expect((await request(app).post('/api/coordination/appointments').set('Authorization', auth(doctor)).send(body)).status).toBe(403);
    expect((await request(app).get('/api/coordination/doctor/patients').set('Authorization', auth(stranger))).status).toBe(403);
  });

  test('simultaneous consent grants have one winner', async () => {
    const other = await register('Concurrent Patient');
    const payload = { caregiverEmail: caregiver.email, caregiverName: 'Caregiver', relationship: 'Family', permissions: ['VIEW_OBSERVATIONS'] };
    const responses = await Promise.all([1, 2].map(() => request(app).post('/api/consents').set('Authorization', auth(other)).send(payload)));
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.caregiverConsent.count({ where: { patientId: other.id, caregiverEmail: caregiver.email, status: 'ACTIVE' } })).toBe(1);
  });

  test('simultaneous overlapping bookings have one winner and adjacent bookings are allowed', async () => {
    const first = await register('First Patient');
    const second = await register('Second Patient');
    const time = Date.now() + 4 * 86400000;
    const make = (user: any, offset: number) => request(app).post('/api/coordination/appointments').set('Authorization', auth(user)).send({ doctorId: doctor.id, scheduledAt: new Date(time + offset * 60000).toISOString(), durationMinutes: 30, reason: 'Follow-up' });
    const responses = await Promise.all([make(first, 0), make(second, 15)]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    const winner = responses.find(r => r.status === 201)!;
    const after = new Date(winner.body.appointment.scheduledAt).getTime() + 30 * 60000;
    expect((await make(first, (after - time) / 60000)).status).toBe(201);
    expect(await prisma.appointment.count({ where: { doctorId: doctor.id, scheduledAt: { gte: new Date(time), lt: new Date(time + 30 * 60000) } } })).toBe(1);
  });
});
